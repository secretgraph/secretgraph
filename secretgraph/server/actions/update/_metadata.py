from __future__ import annotations

__all__ = [
    "transform_tags",
    "transform_references",
    "atransform_references",
    "update_content_metadata_fn",
]

import logging
import re
from contextlib import nullcontext
from typing import TYPE_CHECKING, Iterable, Optional
from uuid import uuid4

from asgiref.sync import sync_to_async
from django.conf import settings
from django.db.models import F, Q
from django.db.models.functions import Substr
from django.utils.timezone import now
from strawberry_django import django_resolver

from ....core.constants import DeleteRecursive, MetadataOperations
from ....core.exceptions import ResourceLimitExceeded
from ...models import Content, ContentReference, ContentTag
from ...utils.auth import get_cached_result
from ...utils.hashing import getPrefix
from ...validators import TypeAndGroup_regex

if TYPE_CHECKING:
    from ....core import typings
    from ._arguments import ReferenceInput

logger = logging.getLogger(__name__)

default_hash_prefix = getPrefix()


def tags_sanitizer(tag: str):
    if len(tag) > settings.SECRETGRAPH_TAG_LIMIT:
        raise ResourceLimitExceeded(f"Tag too big ({tag})")
    if tag.startswith("id"):
        logger.warning("id is an invalid flag/tag, it is a special keyword, ignore")
        return False
    eq_pos = tag.find("=")
    if eq_pos == 0:
        raise ValueError("Cannot start with =")
    if tag == "key_hash":
        raise ValueError("key_hash should be tag not flag")
    if tag.startswith("~key_hash"):
        raise ValueError("key_hash is unencrypted")
    if tag.startswith("~") and eq_pos < 0:
        raise ValueError("flags are not encryptable")

    if tag.startswith("immutable="):
        raise ValueError("immutable is a flag")
    if tag.startswith("freeze="):
        raise ValueError("freeze is a flag")
    if eq_pos >= 0:
        if not TypeAndGroup_regex.match(tag, 0, eq_pos):
            raise ValueError("invalid tag prefix")
    else:
        if not TypeAndGroup_regex.match(tag):
            raise ValueError("invalid flag")
    return True


def transform_tags(
    content_type,
    tags,
    oldtags=None,
    operation=MetadataOperations.APPEND,
    early_size_limit=None,
):
    newtags = {}
    key_hashes = set()
    oldtags = oldtags or []
    operation = operation or MetadataOperations.APPEND
    new_had_keyhash = False
    size_new = 0
    transfer_type = 0
    tags = filter(tags_sanitizer, tags)
    if operation == MetadataOperations.REMOVE and oldtags:
        remove_filter = re.compile(r"^(?:%s)" % "|".join(map(re.escape, tags)))
        tags = filter(lambda x: not remove_filter.match(x), oldtags)

    for tag in tags:
        # otherwise the iterator is exhausted
        # exclude freeze, immutable from size calculation
        if tag not in {"freeze", "immutable"}:
            size_new += len(tag)
        if early_size_limit is not None and size_new > early_size_limit:
            raise ResourceLimitExceeded(
                "tags specified exceed maximal operation" "size (quota or global limit)"
            )
        splitted_tag = tag.split("=", 1)
        if splitted_tag[0] == "key_hash":
            if splitted_tag[1].startswith(default_hash_prefix):
                new_had_keyhash = True
                key_hashes.add(splitted_tag[1])
        if len(splitted_tag) == 2:
            if splitted_tag[0] == "transfer_url":
                transfer_type = 1
            elif splitted_tag[0] == "~transfer_url":
                transfer_type = 2
            s = newtags.setdefault(splitted_tag[0], set())
            if not isinstance(s, set):
                raise ValueError("Tag and Flag name collision")
            s.add(splitted_tag[1])
        elif newtags.setdefault(splitted_tag[0], None) is not None:
            raise ValueError("Tag and Flag name collision")
        if splitted_tag[0].startswith("~"):
            if splitted_tag[0][:1] in newtags:
                raise ValueError("encrypted and unencrypted tag/flag collision")
        else:
            if f"~{splitted_tag[0]}" in newtags:
                raise ValueError("encrypted and unencrypted tag/flag collision")

    if operation != MetadataOperations.REMOVE and oldtags:
        for tag in oldtags:
            splitted_tag = tag.split("=", 1)
            if splitted_tag[0] == "key_hash":
                if operation == MetadataOperations.REPLACE and new_had_keyhash:
                    continue
                if splitted_tag[1].startswith(default_hash_prefix):
                    key_hashes.add(splitted_tag[1])

            if len(splitted_tag) == 2:
                if (
                    operation == MetadataOperations.APPEND
                    or splitted_tag[0] not in newtags
                ):
                    s = newtags.setdefault(splitted_tag[0], set())
                    # can switch type of tag (flag/key value)
                    if not isinstance(s, set):
                        continue
                    if splitted_tag[1] not in s:
                        s.add(splitted_tag[1])
                        size_new += len(tag)
            else:
                # can switch type of tag (flag/key value)
                if splitted_tag[0] not in s:
                    size_new += len(tag)
                    newtags[splitted_tag[0]] = None

    if content_type == "PrivateKey" and not newtags.get("key"):
        raise ValueError("PrivateKey has no key=<foo> tag")
    # it is not wrong to define both, immutable has higher priority than
    # freeze and removes it
    if newtags.get("immutable"):
        newtags.pop("freeze")
    return newtags, key_hashes, transfer_type, size_new


atransform_tags = sync_to_async(transform_tags)


def clean_deleteRecursive(group, val):
    if val:
        # handle enum values
        if hasattr(val, "value"):
            val = val.value
        if val not in DeleteRecursive.valid_values:
            raise ValueError(
                "Invalid value for deleteRecursive: %s (%s)" % (val, type(val))
            )
        return val
    # set defaults
    if group == "signature":
        return DeleteRecursive.FALSE.value
    elif group in {"key", "transfer"}:
        return DeleteRecursive.NO_GROUP.value
    else:
        return DeleteRecursive.TRUE.value


def transform_references(
    content,
    references,
    key_hashes_tags,
    allowed_targets,
    no_final_refs=False,
    early_size_limit=None,
):
    # no_final_refs final_references => None
    final_references = None if no_final_refs else []
    sig_target_hashes = set()
    encrypt_target_hashes = set()
    deduplicate = set()
    is_transfer = False
    injectable_keys = Content.objects.injected_keys()
    size = 0
    for ref in references or []:
        injected_ref = None
        refob = None
        if isinstance(ref, ContentReference):
            refob = ref
            if not allowed_targets.filter(
                id=refob.target_id, markForDestruction=None
            ).exists():
                continue
        else:
            injected_key = None
            if isinstance(ref.target, Content):
                # can be also injected key but here is no reason
                # to add a second relation
                targetob = ref.target
            else:
                if isinstance(ref.target, int):
                    q = Q(id=ref.target)
                else:
                    # the direct way doesn't work
                    # subquery is necessary for chaining operations correctly
                    q = (
                        Q(flexid=ref.target)
                        | Q(flexid_cached=ref.target)
                        | Q(
                            type="PublicKey",
                            tags__tag=f"key_hash={ref.target}",
                        )
                    )

                targetob = allowed_targets.filter(q, markForDestruction=None).first()
                injected_key = injectable_keys.filter(
                    q, markForDestruction=None
                ).first()
            if targetob:
                refob = ContentReference(
                    source=content,
                    target=targetob,
                    group=ref.group or "",
                    extra=ref.extra or "",
                    deleteRecursive=clean_deleteRecursive(
                        ref.group, ref.deleteRecursive
                    ),
                )
            # injected_ref can only exist if no reference is last_used
            if injected_key and (not targetob or injected_key.id != targetob.id):
                injected_ref = ContentReference(
                    source=content,
                    target=injected_key,
                    group="key",
                    extra=ref.extra or "",
                    deleteRecursive=DeleteRecursive.FALSE.value,
                )
        # first extra tag in same group with same target wins
        # injected key refs needn't appear in key_hashes_tags
        if (
            injected_ref
            and (injected_ref.group, injected_ref.target.id) not in deduplicate
        ):
            deduplicate.add((injected_ref.group, injected_ref.target.id))
            size += len(injected_ref.extra) + 28
            if len(injected_ref.extra) > settings.SECRETGRAPH_TAG_LIMIT:
                raise ResourceLimitExceeded("Extra tag of ref too big")
            if early_size_limit is not None and size > early_size_limit:
                raise ResourceLimitExceeded("references exhausts resource limit ")
            # must be target
            encrypt_target_hashes.add(injected_ref.contentHash.removeprefix("Key:"))
            # is not required to be in tags
            if not no_final_refs:
                final_references.append(injected_ref)

        # first extra tag in same group  with same target wins
        if refob and (refob.group, refob.target.id) not in deduplicate:
            deduplicate.add((refob.group, refob.target.id))
            size += len(refob.extra) + 28
            if len(refob.extra) > settings.SECRETGRAPH_TAG_LIMIT:
                raise ResourceLimitExceeded("Extra tag of ref too big")
            if early_size_limit is not None and size > early_size_limit:
                raise ResourceLimitExceeded(
                    "references specified exceed maximal operation"
                    "size (quota or global limit)"
                )
            if refob.group == "signature":
                sig_target_hashes.add(targetob.contentHash.removeprefix("Key:"))
            if refob.group in {"key", "transfer"}:
                chash = targetob.contentHash.removeprefix("Key:")
                encrypt_target_hashes.add(chash)
                if refob.group == "transfer":
                    is_transfer = True
                if chash not in key_hashes_tags:
                    raise ValueError("Key hash not found in tags")
            if not no_final_refs:
                final_references.append(refob)
    return (
        final_references,
        encrypt_target_hashes,
        sig_target_hashes,
        is_transfer,
        size,
    )


atransform_references = sync_to_async(transform_references)


async def update_content_metadata_fn(
    request,
    content,
    *,
    state: Optional[typings.ContentState] = None,
    tags: Optional[Iterable[str]] = None,
    references: Optional[Iterable[ReferenceInput]] = None,
    operation=MetadataOperations.APPEND,
    authset=None,
    required_keys=None,
):
    operation = operation or MetadataOperations.APPEND
    final_tags = None
    remove_tags_q = Q()
    remove_refs_q = Q()
    size_diff = 0
    refs_is_transfer = False
    tags_is_transfer_type = 0
    if state:
        content.state = state
    early_op_limit = (
        settings.SECRETGRAPH_OPERATION_SIZE_LIMIT
        if content.net.quota is None
        else content.net.quota
    )
    if tags:
        oldtags = [val async for val in content.tags.values_list("tag", flat=True)]
        (
            tags_dict,
            key_hashes_tags,
            tags_is_transfer_type,
            size_tags_new,
        ) = await atransform_tags(
            content.type,
            tags,
            oldtags,
            operation,
            early_size_limit=early_op_limit,
        )
        size_diff += size_tags_new - content.size_tags

        if operation in {
            MetadataOperations.APPEND,
            MetadataOperations.REPLACE,
        }:
            final_tags = []
            for prefix, val in tags_dict.items():
                if not val:
                    # can switch tags to flags
                    remove_tags_q |= Q(tag__startswith=prefix)
                    final_tags.append(ContentTag(content=content, tag=prefix))
                else:
                    for subval in val:
                        composed = "%s=%s" % (prefix, subval)
                        remove_tags_q |= Q(tag__startswith=composed)
                        final_tags.append(ContentTag(content=content, tag=composed))
        else:
            # immutable flag can only removed by admins as we filter in handler
            for prefix, val in tags_dict.items():
                if not val:
                    remove_tags_q &= ~Q(tag__startswith=prefix)
                else:
                    for subval in val:
                        composed = "%s=%s" % (prefix, subval)
                        remove_tags_q &= ~Q(tag__startswith=composed)
    else:
        kl = [
            val
            async for val in content.tags.filter(tag__startswith="key_hash=")
            .annotate(key_hash=Substr("tag", 10))
            .values_list("key_hash", flat=True)
        ]
        key_hashes_tags = set(kl)

    if references is None:
        _refs = await content.references.aall()
    elif operation in {MetadataOperations.REMOVE, MetadataOperations.REPLACE}:
        _refs = []
        if MetadataOperations.REPLACE:
            _refs = references
        remrefs = set(map(lambda x: (x.group, x.target), references))
        for ref in content.references.all():
            if (ref.group, None) in remrefs:
                remove_refs_q |= Q(id=ref.id)
                continue
            elif (ref.group, ref.target_id) in remrefs:
                remove_refs_q |= Q(id=ref.id)
                continue
            elif (
                ref.group,
                ref.target.contentHash.removeprefix("Key:")
                if ref.target.contentHash
                else None,
            ) in remrefs:
                remove_refs_q |= Q(id=ref.id)
                continue
            _refs.append(ref)
    elif MetadataOperations.APPEND:
        # prefer old extra values, no problem with crashing as ignore_conflict
        _refs = [*content.references.all(), *references]
    # no_final_refs => final_references = None
    (
        final_references,
        key_hashes_ref,
        verifiers_ref,
        refs_is_transfer,
        size_refs_new,
    ) = await atransform_references(
        content,
        _refs,
        key_hashes_tags,
        get_cached_result(
            request,
            cacheName="secretgraphLinkResult",
            scope="link",
            authset=authset,
        )["Content"]["objects_with_public"],
        no_final_refs=references is None,
        early_size_limit=early_op_limit,
    )
    if references is not None:
        size_diff += size_refs_new - content.size_references
    if refs_is_transfer or tags_is_transfer_type:
        raise ValueError("Cannot modify transfer objects")

    if required_keys and required_keys.isdisjoint(verifiers_ref):
        raise ValueError("Not signed by required keys")
    if content.type not in {"PrivateKey", "PublicKey"} and len(key_hashes_ref) < 1:
        raise ValueError(">=1 key references required for content (except Keys)")

    await sync_to_async(content.full_clean)()

    if (
        content.net.quota is not None
        and size_diff > 0
        and content.net.bytes_in_use + size_diff > content.net.quota
    ):
        raise ValueError("quota exceeded")
    # still in memory not serialized to db
    if not content.net.id:
        content.net.bytes_in_use += size_diff
    else:
        content.net.bytes_in_use = F("bytes_in_use") + size_diff
    content.net.last_used = now()

    @django_resolver
    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            content.updateId = uuid4()
            content.save(update_fields=["updateId"])
            content.net.save(
                update_fields=["bytes_in_use", "last_used"] if content.net.id else None
            )
            if final_tags is not None:
                if operation in {
                    MetadataOperations.REMOVE,
                    MetadataOperations.REPLACE,
                }:
                    content.tags.filter(remove_tags_q).delete()
                if operation in {
                    MetadataOperations.APPEND,
                    MetadataOperations.REPLACE,
                }:
                    ContentTag.objects.bulk_create(final_tags, ignore_conflicts=True)
            if final_references is not None:
                if operation in {
                    MetadataOperations.REMOVE,
                    MetadataOperations.REPLACE,
                }:
                    content.references.filter(remove_refs_q).delete()
                if operation in {
                    MetadataOperations.APPEND,
                    MetadataOperations.REPLACE,
                }:
                    ContentReference.objects.bulk_create(
                        final_references, ignore_conflicts=True
                    )
            return content

    return save_fn
