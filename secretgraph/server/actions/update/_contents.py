__all__ = ["create_content_fn", "update_content_fn", "create_key_fn"]


import base64
import logging
import re
from contextlib import nullcontext
from itertools import chain
from typing import List, Optional
from uuid import UUID, uuid4
from dataclasses import fields

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import load_der_public_key
from django.core.exceptions import ObjectDoesNotExist
from django.core.files.base import ContentFile, File
from django.conf import settings
from django.db.models import F, Q

from ....core.exceptions import ResourceLimitExceeded

from ....core import constants
from ...utils.auth import ids_to_results, get_cached_result
from ...utils.misc import calculate_hashes, refresh_fields
from ...models import Cluster, Content, ContentReference, ContentTag, Net
from ._actions import manage_actions_fn
from ._metadata import transform_references, transform_tags
from ._arguments import ContentMergedInput, ContentKeyInput, ReferenceInput

logger = logging.getLogger(__name__)

_emptyset = frozenset()
_contenthash_algo = re.compile(
    "[^:]*:{}:.+|".format(
        constants.mapHashNames[
            settings.SECRETGRAPH_HASH_ALGORITHMS[0]
        ].serializedName
    )
)


def _condMergeKeyTags(
    hashes_tags: List[str], tags: Optional[List[str]], isUpdate: bool
):
    if tags is None and isUpdate:
        return None
    return chain(hashes_tags, tags or _emptyset)


# work around problems with upload
def _value_to_dict(obj):
    return dict(
        (field.name, getattr(obj, field.name)) for field in fields(obj)
    )


def _transform_key_into_dataobj(
    key_obj, publicKeyContent=None
) -> tuple[list[str], ContentMergedInput, Optional[ContentMergedInput]]:
    if isinstance(key_obj.privateKey, str):
        key_obj.privateKey = base64.b64decode(key_obj.privateKey)
    if isinstance(key_obj.publicKey, str):
        key_obj.publicKey = base64.b64decode(key_obj.publicKey)
    if isinstance(key_obj.nonce, str):
        key_obj.nonce = base64.b64decode(key_obj.nonce)
    if key_obj.privateKey:
        if not key_obj.nonce:
            raise ValueError("encrypted private key requires nonce")
    has_public_key = True
    if not key_obj.publicKey:
        if not publicKeyContent:
            raise ValueError("No public key")
        else:
            has_public_key = False
            key_obj.publicKey = publicKeyContent.file.open("rb").read()
    try:
        if isinstance(key_obj.publicKey, bytes):
            key_obj.publicKey = load_der_public_key(key_obj.publicKey)
        elif isinstance(key_obj.publicKey, File):
            key_obj.publicKey = load_der_public_key(key_obj.publicKey.read())
        key_obj.publicKey = key_obj.publicKey.public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    except Exception as exc:
        # logger.debug("loading public key failed", exc_info=exc)
        raise ValueError("Invalid public key") from exc
    if publicKeyContent and has_public_key:
        if publicKeyContent.file.open("rb").read() != key_obj.publicKey:
            raise ValueError("Cannot change public key")
    hashes = calculate_hashes(key_obj.publicKey)
    hashes_tags = tuple(map(lambda x: f"key_hash={x}", hashes))
    if key_obj.privateKey:
        if not any(
            filter(
                lambda x: x.startswith("key="),
                key_obj.privateTags,
            )
        ):
            raise ValueError("missing key tag")
    publicState = key_obj.publicState
    if not publicState:
        if publicKeyContent:
            publicState = publicKeyContent.state
        else:
            publicState = "public"

    return (
        hashes,
        ContentMergedInput(
            value=key_obj.publicKey,
            type="PublicKey",
            state=publicState,
            hidden=False,
            tags=_condMergeKeyTags(
                hashes_tags, key_obj.publicTags, bool(publicKeyContent)
            ),
            contentHash=hashes[0],
            actions=key_obj.publicActions,
        ),
        ContentMergedInput(
            nonce=key_obj.nonce,
            value=key_obj.privateKey,
            type="PrivateKey",
            hidden=False,
            state="internal",
            tags=_condMergeKeyTags(
                hashes_tags, key_obj.privateTags, bool(publicKeyContent)
            ),
            contentHash=None,
            actions=key_obj.privateActions,
        )
        if key_obj.privateKey
        else None,
    )


def _update_or_create_content_or_key(
    request,
    content,
    objdata: ContentMergedInput,
    authset,
    is_key,
    required_keys,
):
    create = not content.id
    size_new = 0
    size_old = 0
    if not create:
        size_old = content.size

    if isinstance(objdata.cluster, str):
        objdata.cluster = (
            ids_to_results(
                request,
                objdata.cluster,
                Cluster,
                # create includes move permission
                scope="create",
                authset=authset,
            )["Cluster"]["objects"]
            .filter(markForDestruction=None)
            .first()
        )
    # when changed
    old_cluster = None
    if objdata.cluster:
        if (
            not create
            and content.cluster
            and objdata.cluster != content.cluster
        ):
            old_cluster = content.cluster
        content.cluster = objdata.cluster

    if not getattr(content, "cluster", None):
        raise ValueError("No cluster specified")

    # set net on non-initializated contents
    # either by explicit cluster id of net or implicit of the current cluster
    net = objdata.net
    old_net = None
    if not create:
        old_net = content.net
    if net:
        if isinstance(net, Net):
            content.net = net
        else:
            # first use simple query checking if in additionalNets
            if objdata.additionalNets:
                content.net = Net.objects.filter(
                    Q(clusters__flexid=net) | Q(clusters__flexid_cached=net),
                    id__in=objdata.additionalNets,
                ).first()
            else:
                content.net = None
            # content.net is None or result of first()
            # then check if user has permission to use the selected net
            # there is no shortcut possible (why, because of update action)
            if not content.net_id:
                net_result = ids_to_results(
                    request,
                    objdata.net,
                    Cluster,
                    "create",
                    authset=authset,
                )["Cluster"]
                content.net = net_result["objects"].get().net
    if create and not content.net_id:
        content.net = content.cluster.net
    if old_net == content.net:
        old_net = None
    del net
    early_op_limit = (
        settings.SECRETGRAPH_OPERATION_SIZE_LIMIT
        if content.net.quota is None
        else content.net.quota
    )

    if create:
        content.type = objdata.type
    if not content.type:
        raise ValueError("No type specified")
    elif not is_key and content.type in {"PrivateKey", "PublicKey"}:
        raise ValueError("%s is an invalid type" % content.type)
    oldstate = "draft" if create else content.state
    if objdata.state:
        content.state = objdata.state
    if not content.state:
        raise ValueError("No state specified")
    tags_dict = None
    key_hashes_tags = set()
    if objdata.tags is not None:
        tags_dict, key_hashes_tags, size_new_tags = transform_tags(
            content.type, objdata.tags, early_size_limit=early_op_limit
        )
        size_new += size_new_tags
    elif create:
        raise ValueError("Content tags are missing")
    else:
        size_new += content.size_tags
        if objdata.references is not None:
            key_hashes_tags = set()

    # hidden
    if objdata.hidden is not None:
        content.hidden = objdata.hidden
    elif content.state != "draft":
        assert is_key is False, "Keys should not be affected by hidden"
        if content.state == "public":
            if create or oldstate == "draft" or oldstate == "internal":
                content.hidden = objdata.cluster.groups.filter(
                    properties__name="auto_hide_global"
                    if content.cluster.name.startswith("@")
                    else "auto_hide_local"
                ).exists()
            elif objdata.cluster.groups.filter(
                properties__name="auto_hide_global_update"
                if content.cluster.name.startswith("@")
                else "auto_hide_local_update"
            ).exists():
                content.hidden = True
        else:
            content.hidden = False
    elif create:
        content.hidden = False

    # if create checked in parent function
    if objdata.value:
        # normalize nonce and check constraints
        if content.state in constants.public_states:
            objdata.nonce = ""
            checknonce = b""
        elif isinstance(objdata.nonce, bytes):
            checknonce = objdata.nonce
            objdata.nonce = base64.b64encode(checknonce).decode("ascii")
        elif not objdata.nonce:
            checknonce = b""
        else:
            checknonce = base64.b64decode(objdata.nonce)
        # is public key or public? then ignore nonce checks
        if not content.type == "PublicKey" and content.state != "public":
            if not checknonce:
                raise ValueError(
                    "Content must be encrypted and nonce specified"
                )
            if len(checknonce) != 13:
                raise ValueError("invalid nonce size")
            if checknonce.count(b"\0") == len(checknonce):
                raise ValueError("weak nonce")
        assert isinstance(
            objdata.nonce, str
        ), "nonce should be here a base64 string or public, %s" % type(
            objdata.nonce
        )  # noqa E502
        assert isinstance(
            checknonce, bytes
        ), "checknonce should be bytes, %s" % type(
            checknonce
        )  # noqa E502
        content.nonce = objdata.nonce

        if isinstance(objdata.value, bytes):
            objdata.value = ContentFile(objdata.value)
        elif isinstance(objdata.value, str):
            objdata.value = ContentFile(base64.b64decode(objdata.value))
        elif not isinstance(objdata.value, File):
            objdata.value = File(objdata.value)
        if content.net.max_upload_size is not None:
            if content.net.max_upload_size < objdata.value.size:
                raise ValueError("file too big")
        size_new += objdata.value.size
        content.clean()

        def save_fn_value():
            content.file.delete(False)
            content.updateId = uuid4()
            content.file.save("ignored", objdata.value)
            content.net.save(
                update_fields=["bytes_in_use"] if content.net.id else None
            )
            if old_net:
                old_net.save(
                    update_fields=["bytes_in_use"] if old_net.id else None
                )

    else:

        def save_fn_value():
            content.updateId = uuid4()
            content.save()
            content.net.save(
                update_fields=["bytes_in_use"] if content.net.id else None
            )
            if old_net:
                old_net.save(
                    update_fields=["bytes_in_use"] if old_net.id else None
                )

    chash = objdata.contentHash
    if chash is not None:
        # either blank or
        if chash == "":
            content.contentHash = None
        else:
            content.contentHash = chash
    del chash

    final_references = None
    key_hashes_ref = set()
    verifiers_ref = set()
    if (
        old_cluster
        or objdata.references is not None
        or objdata.tags is not None
    ):
        if objdata.references is None:
            refs = (
                content.references.all()
                if content.id
                else ContentReference.objects.none()
            )
        else:
            refs = objdata.references
        # no_final_refs final_references => None
        (
            final_references,
            key_hashes_ref,
            verifiers_ref,
            size_refs,
        ) = transform_references(
            content,
            refs,
            key_hashes_tags,
            get_cached_result(request, authset=authset)["Content"]["objects"],
            no_final_refs=objdata.references is None,
            early_size_limit=early_op_limit,
        )
        if required_keys and required_keys.isdisjoint(verifiers_ref):
            raise ValueError("Not signed by required keys")
        size_new += size_refs
    elif create:
        final_references = []
        # size_new += 0
    else:
        size_new += content.size_references

    final_tags = None
    if tags_dict is not None:
        if content.type == "PrivateKey" and len(key_hashes_tags) < 1:
            raise ValueError("requires hash of decryption key as key_hash tag")
        elif (
            content.type == "PublicKey"
            and content.contentHash not in key_hashes_tags
        ):
            raise ValueError(
                ">=1 key_hash info tags required for PublicKey (own hash)"
            )
        elif not key_hashes_tags.issuperset(required_keys):
            raise ValueError("missing required keys")
        final_tags = []
        for prefix, val in tags_dict.items():
            if not val:
                final_tags.append(ContentTag(content=content, tag=prefix))
            else:
                for subval in val:
                    final_tags.append(
                        ContentTag(
                            content=content, tag="%s=%s" % (prefix, subval)
                        )
                    )

    if final_references is not None:
        if (
            not is_key
            and content.state != "public"
            and len(key_hashes_ref) < 1
        ):
            raise ValueError(">=1 key references required for non-key content")
    if objdata.actions is not None:
        actions_save_fn = manage_actions_fn(
            request, content, objdata.actions, authset=authset
        )
    else:

        def actions_save_fn():
            pass

    if old_net is None:
        size_diff = size_new - size_old
        if (
            content.net.quota is not None
            and size_diff > 0
            and content.net.bytes_in_use + size_diff > content.net.quota
        ):
            raise ResourceLimitExceeded("quota exceeded")
        # still in memory not serialized to db
        if not content.net.id:
            content.net.bytes_in_use += size_diff
        else:
            content.net.bytes_in_use = F("bytes_in_use") + size_diff
    else:
        if (
            content.net.quota is not None
            and size_new > 0
            and content.net.bytes_in_use + size_new > content.net.quota
        ):
            raise ResourceLimitExceeded("quota exceeded")
        # still in memory not serialized to db
        if not content.net.id:
            content.net.bytes_in_use += size_new
        else:
            content.net.bytes_in_use = F("bytes_in_use") + size_new

        if not old_net.id:
            old_net.bytes_in_use -= size_old
        else:
            old_net.bytes_in_use = F("bytes_in_use") - size_old

    def save_fn():
        save_fn_value()
        if final_tags is not None:
            if create:
                ContentTag.objects.bulk_create(
                    refresh_fields(final_tags, "content")
                )
            else:
                content.tags.all().delete()
                ContentTag.objects.bulk_create(final_tags)

        if final_references is not None:
            if not create:
                if is_key:
                    refs = content.references.exclude(group="public_key")
                else:
                    refs = content.references.all()
                refs.delete()
            # must refresh in case a new target is injected and saved before
            ContentReference.objects.bulk_create(
                refresh_fields(final_references, "source", "target")
            )
        actions_save_fn()
        return content

    setattr(save_fn, "content", content)
    return save_fn


def create_key_fn(request, objdata, authset=None):
    """creates or updates public key, creates private key if specified"""
    key_obj = objdata.key
    if not key_obj:
        raise ValueError("Requires key")
    if isinstance(objdata.cluster, str):
        objdata.cluster = (
            ids_to_results(
                request,
                objdata.cluster,
                Cluster,
                authset=authset,
                # create includes move permission
                scope="create",
            )["Cluster"]["objects"]
            .filter(markForDestruction=None)
            .first()
        )
    if not objdata.cluster:
        raise ValueError("No cluster")

    hashes, public, private = _transform_key_into_dataobj(key_obj)

    public.net = objdata.net
    if private:
        private.net = objdata.net
    publickey_content = None
    if objdata.cluster.id:
        publickey_content = Content.objects.filter(
            cluster=objdata.cluster,
            type="PublicKey",
            tags__tag__in=map(lambda x: f"key_hash={x}", hashes),
        ).first()
    publickey_content = publickey_content or Content(cluster=objdata.cluster)
    # ensure public key values is not updated
    # note: public has objdata format for _update_or_create_content_or_key
    if publickey_content.id:
        public.value = None
        public.nonce = None
        if public["actions"]:
            raise ValueError("Key already exists and actions specified")
    # distribute references automagically
    if objdata.references:
        # cannot update references of existing public key
        if publickey_content.id:
            public.references = None
        else:
            public.references = []
        for ref in objdata.references:
            if ref.group == "key":
                if private:
                    private.references = list(private.references)
                    private.references.append(ref)
            elif not publickey_content.id:
                public.references.append(ref)

    public = _update_or_create_content_or_key(
        request, publickey_content, public, authset, True, []
    )
    if private:
        private.references = list(private.references or [])
        private.references.append(
            ReferenceInput(
                target=publickey_content,
                group="public_key",
                deleteRecursive=constants.DeleteRecursive.TRUE.value,
            )
        )
        private = _update_or_create_content_or_key(
            request,
            Content(cluster=objdata.cluster),
            private,
            authset,
            True,
            [],
        )

    def func():
        return {"public": public(), "private": private() if private else None}

    return func


def create_content_fn(request, objdata, authset=None, required_keys=None):
    value_obj = objdata.value
    key_obj = objdata.key
    if not value_obj and not key_obj:
        raise ValueError("Requires value or key")
    if value_obj and key_obj:
        raise ValueError("Can only specify one of value or key")
    if key_obj:
        # has removed key argument for only allowing complete key
        _save_fn = create_key_fn(request, objdata, authset=authset)

        def save_fn(context=nullcontext):
            if callable(context):
                context = context()
            with context:
                return {
                    "content": _save_fn()["public"],
                    "writeok": True,
                }

    else:
        newdata = ContentMergedInput(
            cluster=objdata.cluster,
            references=objdata.references,
            contentHash=objdata.contentHash,
            hidden=objdata.hidden,
            **_value_to_dict(value_obj),
        )
        content_obj = Content()
        _save_fn = _update_or_create_content_or_key(
            request, content_obj, newdata, authset, False, required_keys or []
        )

        def save_fn(context=nullcontext):
            if callable(context):
                context = context()
            with context:
                return {"content": _save_fn(), "writeok": True}

    return save_fn


def update_content_fn(
    request, content, objdata, updateId, authset=None, required_keys=None
):
    assert content.id
    try:
        updateId = UUID(updateId)
    except Exception:
        raise ValueError("updateId is not an uuid")
    is_key = False
    if content.type == "PublicKey":
        # can only update public tags and actions, updateId
        is_key = True
        required_keys = []
        if not objdata.key:
            raise ValueError("Cannot transform key to content")
        if objdata.cluster:
            raise ValueError("Cannot update cluster of key")

        key_obj = ContentKeyInput(**_value_to_dict(objdata.key))

        if not key_obj.publicTags:
            key_obj.publicTags = content.tags.exclude(
                tag__startswith="key_hash="
            ).values_list("tag", flat=True)
        key_obj.privateTags = None
        hashes, newdata, _private = _transform_key_into_dataobj(
            key_obj,
            publicKeyContent=content,
        )
        newdata.net = objdata.net
    elif content.type == "PrivateKey":
        # can only update private tags and actions, updateId
        is_key = True
        if not objdata.key:
            raise ValueError("Cannot transform key to content")
        if objdata.cluster:
            raise ValueError("Cannot update cluster of key")
        # we don't see it or update it anyway so include all
        # without regard to state
        publicKeyContent = Content.objects.filter(
            type="PublicKey", referencedBy__source=content
        ).first()

        key_obj = ContentKeyInput(**_value_to_dict(objdata.key))

        if not key_obj.privateTags:
            key_obj.privateTags = content.tags.exclude(
                tag__startswith="key_hash="
            ).values_list("tag", flat=True)
        key_obj.publicTags = None

        hashes, _public, newdata = _transform_key_into_dataobj(
            key_obj,
            publicKeyContent=publicKeyContent,
        )
        if not newdata:
            raise ValueError("No data for private key")
        newdata.net = objdata.net
    else:
        newdata = ContentMergedInput(
            cluster=objdata.cluster,
            net=objdata.net,
            references=objdata.references,
            contentHash=objdata.contentHash,
            hidden=objdata.hidden,
            **(_value_to_dict(objdata.value) if objdata.value else {}),
        )
    func = _update_or_create_content_or_key(
        request, content, newdata, authset, is_key, required_keys or []
    )

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            try:
                Content.objects.get(id=content.id, updateId=updateId)
            except ObjectDoesNotExist:
                return {
                    "content": Content.objects.filter(id=content.id).first(),
                    "writeok": False,
                }
            return {"content": func(), "writeok": True}

    return save_fn
