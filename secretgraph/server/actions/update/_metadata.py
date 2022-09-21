__all__ = [
    "transform_tags",
    "extract_key_hashes",
    "transform_references",
    "update_metadata_fn",
]

import logging
from uuid import uuid4
import re
from contextlib import nullcontext

from django.db.models import Q, F

from ....core.constants import MetadataOperations, DeleteRecursive
from ...utils.auth import get_cached_result
from ...utils.misc import hash_object
from ...models import Content, ContentReference, ContentTag

logger = logging.getLogger(__name__)

len_default_hash = len(hash_object(b""))

_invalid_update_tags = re.compile("^(?:id|state|type)=?")


def extract_key_hashes(tags):
    key_hashes = set()
    content_type = None
    for tag in tags:
        if isinstance(tag, ContentTag):
            tag = tag.tag
        splitted_tag = tag.split("=", 1)
        if splitted_tag[0] == "key_hash":
            if len_default_hash == len(splitted_tag[1]):
                key_hashes.add(splitted_tag[1])
        elif splitted_tag[0] == "type":
            content_type = splitted_tag[1]
    return key_hashes, content_type


def transform_tags(
    content_type,
    tags,
    oldtags=None,
    operation=MetadataOperations.APPEND,
    early_size_limit=None,
):
    newtags = {}
    newtags_set = set()
    key_hashes = set()
    tags = tags or []
    oldtags = oldtags or []
    operation = operation or MetadataOperations.APPEND
    new_had_keyhash = False
    if operation == MetadataOperations.REMOVE and oldtags:
        tags = filter(lambda x: not _invalid_update_tags.match(x), tags)
        remove_filter = re.compile(r"^(?:%s)" % "|".join(map(re.escape, tags)))
        tags = filter(lambda x: not remove_filter.match(x), oldtags)
    for tag in tags:
        splitted_tag = tag.split("=", 1)
        if _invalid_update_tags.match(splitted_tag[0]):
            logger.warning(f"{splitted_tag[0]} is a not updatable tag")
            continue
        elif splitted_tag[0] == "key_hash":
            if len(splitted_tag) == 1:
                raise ValueError("key_hash should be tag not flag")
            new_had_keyhash = True
            if len_default_hash == len(splitted_tag[1]):
                key_hashes.add(splitted_tag[1])
        if len(tag) > 8000:
            raise ValueError("Tag too big")
        if len(splitted_tag) == 2:
            s = newtags.setdefault(splitted_tag[0], set())
            if not isinstance(s, set):
                raise ValueError("Tag and Flag name collision")
            s.add(splitted_tag[1])
        elif newtags.setdefault(splitted_tag[0], None) is not None:
            raise ValueError("Tag and Flag name collision")
        newtags_set.add(splitted_tag[0])

    if operation != MetadataOperations.REMOVE and oldtags:
        for tag in oldtags:
            splitted_tag = tag.split("=", 1)
            if splitted_tag[0] == "id":
                continue
            if splitted_tag[0] == "key_hash":
                if operation == MetadataOperations.REPLACE and new_had_keyhash:
                    continue
                if len_default_hash == len(splitted_tag[1]):
                    key_hashes.add(splitted_tag[1])

            if len(splitted_tag) == 2:
                if (
                    operation == MetadataOperations.APPEND
                    or splitted_tag[0] not in newtags_set
                ):
                    s = newtags.setdefault(splitted_tag[0], set())
                    if not isinstance(s, set):
                        continue
                    s.add(splitted_tag[1])
            elif newtags.setdefault(splitted_tag[0], None) is not None:
                pass

    if content_type == "PrivateKey" and not newtags.get("key"):
        raise ValueError("PrivateKey has no key=<foo> tag")
    size_new = len("".join(newtags))
    return newtags, key_hashes, size_new


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
            if isinstance(ref["target"], Content):
                # can be also injected key but here is no reason
                # to add a second relation
                targetob = ref["target"]
            else:
                if isinstance(ref["target"], int):
                    q = Q(id=ref["target"])
                else:
                    # the direct way doesn't work
                    # subquery is necessary for chaining operations correctly
                    q = (
                        Q(flexid=ref["target"])
                        | Q(flexid_cached=ref["target"])
                        | Q(
                            type="PublicKey",
                            tags__tag=f"key_hash={ref['target']}",
                        )
                    )

                targetob = allowed_targets.filter(
                    q, markForDestruction=None
                ).first()
                injected_key = injectable_keys.filter(
                    q, markForDestruction=None
                ).first()
            if targetob:
                refob = ContentReference(
                    source=content,
                    target=targetob,
                    group=ref.get("group") or "",
                    extra=ref.get("extra") or "",
                    deleteRecursive=clean_deleteRecursive(
                        ref.get("group"), ref.get("deleteRecursive")
                    ),
                )
            # injected_ref can only exist if no reference is used
            if injected_key and (
                not targetob or injected_key.id != targetob.id
            ):
                injected_ref = ContentReference(
                    source=content,
                    target=injected_key,
                    group="key",
                    extra=ref.get("extra") or "",
                    deleteRecursive=DeleteRecursive.FALSE.value,
                )
        # first extra tag in same group with same target wins
        if (
            injected_ref
            and (injected_ref.group, injected_ref.target.id) not in deduplicate
        ):
            deduplicate.add((injected_ref.group, injected_ref.target.id))
            size += len(injected_ref.extra) + 8
            if len(injected_ref.extra) > 8000:
                raise ValueError("Extra tag of ref too big")
            # must be target
            encrypt_target_hashes.add(injected_ref.contentHash)
            # is not required to be in tags
            if not no_final_refs:
                final_references.append(injected_ref)

        # first extra tag in same group  with same target wins
        if refob and (refob.group, refob.target.id) not in deduplicate:
            deduplicate.add((refob.group, refob.target.id))
            size += len(refob.extra) + 8
            if len(refob.extra) > 8000:
                raise ValueError("Extra tag of ref too big")
            if refob.group == "signature":
                sig_target_hashes.add(targetob.contentHash)
            if refob.group in {"key", "transfer"}:
                if refob.group == "key":
                    encrypt_target_hashes.add(targetob.contentHash)
                if targetob.contentHash not in key_hashes_tags:
                    raise ValueError("Key hash not found in tags")
            if not no_final_refs:
                final_references.append(refob)
    return final_references, encrypt_target_hashes, sig_target_hashes, size


def update_metadata_fn(
    request,
    content,
    *,
    state=None,
    tags=None,
    references=None,
    operation=MetadataOperations.APPEND,
    authset=None,
    required_keys=None,
):
    operation = operation or MetadataOperations.APPEND
    final_tags = None
    remove_tags_q = Q()
    remove_refs_q = Q()
    size_diff = 0
    if state:
        content.state = state
    if tags:
        oldtags = content.tags.values_list("tag", flat=True)
        tags_dict, key_hashes_tags, size_tags_new = transform_tags(
            content.type, tags, oldtags, operation
        )
        size_diff += size_tags_new - content.size_tags

        if operation in {
            MetadataOperations.APPEND,
            MetadataOperations.REPLACE,
        }:
            final_tags = []
            for prefix, val in tags_dict.items():
                if not val:
                    remove_tags_q |= Q(tag__startswith=prefix)
                    final_tags.append(ContentTag(content=content, tag=prefix))
                else:
                    for subval in val:
                        composed = "%s=%s" % (prefix, subval)
                        remove_tags_q |= Q(tag__startswith=composed)
                        final_tags.append(
                            ContentTag(content=content, tag=composed)
                        )
        else:
            for prefix, val in tags_dict.items():
                if not val:
                    remove_tags_q &= ~Q(tag__startswith=prefix)
                else:
                    for subval in val:
                        composed = "%s=%s" % (prefix, subval)
                        remove_tags_q &= ~Q(tag__startswith=composed)
    else:
        kl = content.tags.filter(tag__startswith="key_hash=").values_list(
            "tag", flat=True
        )
        key_hashes_tags, content_type = extract_key_hashes(kl)

    if references is None:
        _refs = content.references.all()
    elif operation in {MetadataOperations.REMOVE, MetadataOperations.REPLACE}:
        _refs = []
        if MetadataOperations.REPLACE:
            _refs = references
        remrefs = set(map(lambda x: (x["group"], x["target"]), references))
        for ref in content.references.all():
            if (ref.group, None) in remrefs:
                remove_refs_q |= Q(id=ref.id)
                continue
            elif (ref.group, ref.target_id) in remrefs:
                remove_refs_q |= Q(id=ref.id)
                continue
            elif (ref.group, ref.target.contentHash) in remrefs:
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
        size_refs_new,
    ) = transform_references(
        content,
        _refs,
        key_hashes_tags,
        get_cached_result(request, authset=authset)["Content"]["objects"],
        no_final_refs=references is None,
    )
    if references is not None:
        size_diff += size_refs_new - content.size_references

    if required_keys and required_keys.isdisjoint(verifiers_ref):
        raise ValueError("Not signed by required keys")
    if (
        content.type not in {"PrivateKey", "PublicKey"}
        and len(key_hashes_ref) < 1
    ):
        raise ValueError(
            ">=1 key references required for content (except Keys)"
        )

    content.clean()

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

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            content.updateId = uuid4()
            content.save(update_fields=["updateId"])
            content.net.save(
                update_fields=["bytes_in_use"] if content.net.id else None
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
                    ContentTag.objects.bulk_create(
                        final_tags, ignore_conflicts=True
                    )
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
