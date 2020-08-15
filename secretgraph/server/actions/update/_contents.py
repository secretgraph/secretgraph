__all__ = [
    "create_content_fn", "update_content_fn", "create_key_fn"
]


import base64
import logging
from contextlib import nullcontext
from itertools import chain
from uuid import UUID, uuid4

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import load_der_public_key
from django.core.exceptions import ObjectDoesNotExist
from django.core.files.base import ContentFile, File
from django.db.models import OuterRef, Q, Subquery
from graphql_relay import from_global_id, to_global_id

from ....utils.auth import id_to_result, initializeCachedResult
from ....utils.encryption import default_padding, encrypt_into_file
from ....utils.misc import calculate_hashes, hash_object, refresh_fields
from ...models import Cluster, Content, ContentReference, ContentTag
from ._actions import create_actions_fn
from ._metadata import transform_references, transform_tags

logger = logging.getLogger(__name__)

len_default_hash = len(hash_object(b""))


def _transform_key_into_dataobj(key_obj, content=None):
    if isinstance(key_obj.get("privateKey"), str):
        key_obj["privateKey"] = base64.b64decode(key_obj["privateKey"])
    if isinstance(key_obj.get("publicKey"), str):
        key_obj["publicKey"] = base64.b64decode(key_obj["publicKey"])
    if isinstance(key_obj.get("nonce"), str):
        key_obj["nonce"] = base64.b64decode(key_obj["nonce"])
    if key_obj.get("privateKey"):
        if not key_obj.get("nonce"):
            raise ValueError("encrypted private key requires nonce")
    if not key_obj.get("publicKey"):
        raise ValueError("No public key")
    try:
        if isinstance(key_obj["publicKey"], bytes):
            key_obj["publicKey"] = load_der_public_key(
                key_obj["publicKey"], default_backend()
            )
        elif isinstance(key_obj["publicKey"], File):
            key_obj["publicKey"] = load_der_public_key(
                key_obj["publicKey"].read(), default_backend()
            )
        key_obj["publicKey"] = key_obj["publicKey"].public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
    except Exception as exc:
        # logger.debug("loading public key failed", exc_info=exc)
        raise ValueError("Invalid public key") from exc
    if content:
        if content.value.open("rb").read() != key_obj["publicKey"]:
            raise ValueError("Cannot change public key")
    hashes = calculate_hashes(key_obj["publicKey"])
    hashes_tags = tuple(map(
        lambda x: f"key_hash={x}", hashes
    ))

    return (
        hashes,
        {
            "nonce": b"",
            "value": key_obj["publicKey"],
            "tags": chain(
                ["type=PublicKey"],
                hashes_tags,
                key_obj.get("publicTags") or []
            ),
            "contentHash": hashes[0]
        },
        {
            "nonce": key_obj["nonce"],
            "value": key_obj["privateKey"],
            "tags": chain(
                ["type=PrivateKey"],
                hashes_tags,
                key_obj.get("privateTags") or []
            ),
            "contentHash": None
        } if key_obj.get("privateKey") else None
    )


def _update_or_create_content_or_key(
    request, content, objdata, authset, is_key, required_keys
):
    if isinstance(objdata.get("cluster"), str):
        objdata["cluster"] = id_to_result(
            request,
            objdata["cluster"],
            Cluster,
            scope="update",
            authset=authset
        )["objects"].filter(markForDestruction=None).first()
    if objdata.get("cluster"):
        content.cluster = objdata["cluster"]
    if not getattr(content, "cluster", None):
        raise ValueError("No cluster specified")

    create = not content.id

    # if create checked in parent function
    if objdata.get("value"):
        # normalize nonce and check constraints
        try:
            if isinstance(objdata["nonce"], bytes):
                checknonce = objdata["nonce"]
                objdata["nonce"] = base64.b64encode(checknonce).decode("ascii")
            else:
                checknonce = base64.b64decode(objdata["nonce"])
        except Exception:
            # no nonce == trigger encryption
            objdata["value"], objdata["nonce"], objdata["key"] = \
                encrypt_into_file(
                    objdata["value"],
                    key=objdata.get("key") or None
                )
            objdata["nonce"] = \
                base64.b64encode(objdata["nonce"]).decode("ascii")
        # is public key? then ignore nonce checks
        if not is_key or not objdata.get("contentHash"):
            if len(checknonce) != 13:
                raise ValueError("invalid nonce size")
            if checknonce.count(b"\0") == len(checknonce):
                raise ValueError("weak nonce")
        assert isinstance(objdata["nonce"], str), "nonce should be here base64 astring, %s" % type(objdata["nonce"])  # noqa E502
        content.nonce = objdata["nonce"]

        if isinstance(objdata["value"], bytes):
            objdata["value"] = ContentFile(objdata["value"])
        elif isinstance(objdata["value"], str):
            objdata["value"] = ContentFile(base64.b64decode(objdata["value"]))
        else:
            objdata["value"] = File(objdata["value"])

        def save_fn_value():
            content.file.delete(False)
            content.updateid = uuid4()
            content.file.save("", objdata["value"])
    else:
        def save_fn_value():
            content.updateid = uuid4()
            content.save()

    tags_dict = None
    content_type = None
    content_state = None
    key_hashes_tags = set()
    if objdata.get("tags") is not None:
        tags_dict, key_hashes_tags = transform_tags(objdata.get("tags"))
        content_state = next(iter(tags_dict.get("state", {None})))
        content_type = next(iter(tags_dict.get("type", {None})))
        # final_tags = [ContentTag(content=content, tag=i) for i in final_tags]
        if is_key:
            if content_state not in {"public", "internal"}:
                raise ValueError(
                    "%s is an invalid state for key", content_state
                )
        else:
            if content_type in {"PrivateKey", "PublicKey", None}:
                raise ValueError(
                    "%s is an invalid type or not set", content_type
                )
            elif content_type == "Config" and content_state != "internal":
                raise ValueError(
                    "%s is an invalid state for Config", content_type
                )
            elif content_state not in {
                "draft", "public", "internal"
            }:
                raise ValueError(
                    "%s is an invalid state for content", content_state
                )
    elif objdata.get("references") is not None:
        key_hashes_tags = set()

    # cannot change because of special key transformation
    chash = objdata.get("contentHash")
    if chash is not None:
        if len(chash) not in (0, len_default_hash):
            raise ValueError("Invalid hashing algorithm used for contentHash")
        if chash == "":
            content.contentHash = None
        else:
            content.contentHash = chash

    final_references = None
    key_hashes_ref = set()
    verifiers_ref = set()
    if (
        objdata.get("references") is not None or
        objdata.get("tags") is not None
    ):
        if objdata.get("references") is None:
            refs = content.references.all()
        else:
            refs = objdata["references"]
        # no_final_refs final_references => None
        final_references, key_hashes_ref, verifiers_ref = \
            transform_references(
                content,
                refs,
                key_hashes_tags,
                initializeCachedResult(
                    request, authset=authset
                )["Content"]["objects"],
                no_final_refs=objdata.get("references") is None
            )
        if required_keys and required_keys.isdisjoint(verifiers_ref):
            raise ValueError("Not signed by required keys")
    elif create:
        final_references = []

    inner_key = objdata.get("key")
    if inner_key:
        if isinstance(inner_key, str):
            inner_key = base64.b64decode(inner_key)
        # last resort
        if not is_key and not key_hashes_ref and final_references is not None:
            default_keys = initializeCachedResult(
                request, authset=authset
            )["Content"]["objects"].filter(
                cluster=content.cluster,
                tags__tag="type=PublicKey"
            )

            if required_keys:
                _refs = Subquery(
                    ContentTag.objects.filter(
                        # for correct chaining
                        tag="type=PublicKey",
                        content_id=OuterRef("pk"),
                        content__tags__tag__in=map(
                            lambda x: f"key_hash={x}",
                            required_keys
                        )
                    ).values("pk")
                )
                default_keys |= Content.objects.filter(
                    tags__in=_refs
                )

            for keyob in default_keys.distinct():
                refob = ContentReference(
                    target=keyob, group="key", deleteRecursive=None,
                    extra=keyob.encrypt(
                        inner_key,
                        default_padding
                    )
                )
                final_references.append(refob)
                key_hashes_tags.add(keyob.contentHash)
                tags_dict.setdefault("key_hash", set()).add(
                    keyob.contentHash
                )

    final_tags = None
    if tags_dict is not None:
        if content_type == "PrivateKey" and len(key_hashes_tags) < 1:
            raise ValueError(
                "requires hash of decryption key as key_hash tag"
            )
        elif (
            content_type == "PublicKey" and
            content.contentHash not in key_hashes_tags
        ):
            raise ValueError(
                ">=1 key_hash info tags required for PublicKey (own hash)"
            )
        elif not key_hashes_tags.issuperset(required_keys):
            raise ValueError(
                "missing required keys"
            )
        final_tags = []
        for prefix, val in tags_dict.items():
            if not val:
                final_tags.append(ContentTag(
                    content=content,
                    tag=prefix
                ))
            else:
                for subval in val:
                    final_tags.append(ContentTag(
                        content=content,
                        tag="%s=%s" % (prefix, subval)
                    ))

    if final_references is not None:
        if not is_key and len(key_hashes_ref) < 1:
            raise ValueError(
                ">=1 key references required for content"
            )
    if objdata.get("actions") is not None:
        actions_save_fn = create_actions_fn(
            content, objdata["actions"], request, authset=authset
        )
    else:
        def actions_save_fn():
            pass

    def save_fn():
        save_fn_value()
        if final_tags is not None:
            if create:
                ContentTag.objects.bulk_create(refresh_fields(
                    final_tags, "content"
                ))
            else:
                # simply ignore id=, can only be changed in regenerateFlexid
                content.tags.exclude(
                    Q(tag__startswith="id=")
                ).delete()
                ContentTag.objects.bulk_create(
                    final_tags, "content"
                )

        # create id tag after object was created or update it
        content.tags.update_or_create(
            defaults={"tag": "id=%s" % to_global_id(content.flexid)},
            tag__startswith="id="
        )
        if final_references is not None:
            if not create:
                if is_key:
                    refs = content.references.exclude(group="public_key")
                else:
                    refs = content.references.all()
                refs.delete()
            # must refresh in case a new target is injected and saved before
            ContentReference.objects.bulk_create(refresh_fields(
                final_references, "source", "target"
            ))
        actions_save_fn()
        return content
    setattr(save_fn, "content", content)
    return save_fn


def create_key_fn(
    request, objdata, key=None, authset=None
):
    key_obj = objdata.get("key")
    if not key_obj:
        raise ValueError("Requires key")
    if isinstance(objdata.get("cluster"), str):
        type_name, objdata["cluster"] = from_global_id(objdata["cluster"])
        if type_name != "Cluster":
            raise ValueError("Requires Cluster id")
        objdata["cluster"] = id_to_result(
            request,
            objdata["cluster"],
            Cluster,
            authset=authset
        )["objects"].filter(markForDestruction=None).first()
    if not objdata.get("cluster"):
        raise ValueError("No cluster")

    hashes, public, private = _transform_key_into_dataobj(key_obj)
    publickey_content = None
    if objdata["cluster"].id:
        publickey_content = Content.objects.filter(
            cluster=objdata["cluster"],
            tags__tag="type=PublicKey",
            tags__tag__in=map(lambda x: f"key_hash={x}", hashes)
        ).first()
    publickey_content = \
        publickey_content or Content(cluster=objdata["cluster"])
    if key:
        private["tags"] = chain(
            private["tags"],
            ["key_hash={}".format(hash_object(key))]
        )
    public["references"] = objdata.get("references")
    public["actions"] = objdata.get("actions")
    public = _update_or_create_content_or_key(
        request, publickey_content, public, authset, True, []
    )
    if private:
        private["references"] = [{
            "target": publickey_content,
            "group": "public_key",
            "deleteRecursive": True
        }]
        private = _update_or_create_content_or_key(
            request, Content(cluster=objdata["cluster"]), private, authset,
            True, []
        )

    def func():
        return public(), private and private()

    return func


def create_content_fn(
    request, objdata, key=None, authset=None, required_keys=None
):
    value_obj = objdata.get("value", {})
    key_obj = objdata.get("key")
    if not value_obj and not key_obj:
        raise ValueError("Requires value or key")
    if value_obj and key_obj:
        raise ValueError("Can only specify one of value or key")

    if key_obj:
        # has removed key argument for only allowing complete key
        _save_fn = create_key_fn(
            request, objdata, authset=authset
        )

        def save_fn(context=nullcontext):
            if callable(context):
                context = context()
            with context:
                return _save_fn()[0]
    else:
        newdata = {
            "cluster": objdata.get("cluster"),
            "references": objdata.get("references"),
            "contentHash": objdata.get("contentHash"),
            "tags": value_obj.get("tags"),
            "actions": objdata.get("actions"),
            "key": key,
            **value_obj
        }
        content_obj = Content()
        _save_fn = _update_or_create_content_or_key(
            request, content_obj, newdata, authset, False,
            required_keys or []
        )

        def save_fn(context=nullcontext):
            if callable(context):
                context = context()
            with context:
                return {
                    "content": _save_fn(),
                    "writeok": True
                }
    return save_fn


def update_content_fn(
    request, content, objdata, updateid, key=None, authset=None,
    required_keys=None
):
    assert content.id
    try:
        updateid = UUID(updateid)
    except Exception:
        raise ValueError("updateid is not an uuid")
    is_key = False
    # TODO: maybe allow updating both keys (only tags)
    if content.tags.filter(tag="type=PublicKey"):
        is_key = True
        required_keys = []
        key_obj = objdata.get("key")
        if not key_obj:
            raise ValueError("Cannot transform key to content")

        hashes, newdata, _private = _transform_key_into_dataobj(
            key_obj, content=content
        )
    elif content.tags.filter(tag="type=PrivateKey"):
        is_key = True
        key_obj = objdata.get("key")
        if not key_obj:
            raise ValueError("Cannot transform key to content")

        hashes, _public, newdata = _transform_key_into_dataobj(
            key_obj, content=content
        )
        if not newdata:
            raise ValueError("No data for private key")
    else:
        newdata = {
            "cluster": objdata.get("cluster"),
            "references": objdata.get("references"),
            "contentHash": objdata.get("contentHash"),
            "key": key,
            **(objdata.get("value") or {})
        }
    newdata["actions"] = objdata.get("actions")
    func = _update_or_create_content_or_key(
        request, content, newdata, authset, is_key,
        required_keys or []
    )

    def save_fn(context=nullcontext):
        if callable(context):
            context = context()
        with context:
            try:
                Content.objects.get(id=content.id, updateid=updateid)
            except ObjectDoesNotExist:
                return {
                    "content": Content.objects.filter(id=content.id).first(),
                    "writeok": False
                }
            return {
                "content": func(),
                "writeok": True
            }
    return save_fn
