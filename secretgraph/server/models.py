from __future__ import annotations

import base64
import json
import logging
import posixpath
import secrets
from datetime import datetime as dt
from functools import cached_property
from itertools import chain
from typing import Iterable, Optional, Union
from uuid import UUID, uuid4

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import load_der_public_key
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import File
from django.core.files.storage import default_storage
from django.core.validators import MinLengthValidator
from django.db import models, transaction
from django.db.models.functions import Concat, Length, Substr
from django.urls import reverse
from django.utils import timezone
from strawberry import relay

from ..core import constants
from .messages import (
    cluster_groups_help,
    contentaction_group_help,
    last_used_help,
    net_groups_help,
    net_limit_help,
    reference_group_help,
)
from .validators import (
    ActionKeyHashValidator,
    ContentHashValidator,
    SafeNameValidator,
    TypeAndGroupValidator,
)

logger = logging.getLogger(__name__)

if getattr(settings, "AUTH_USER_MODEL", None):
    from django.contrib.auth import get_user_model

    usermodel = get_user_model()
else:
    usermodel = None


def get_content_file_path(instance, filename) -> str:
    # cluster id can be 0
    cluster_id = instance.cluster_id
    if cluster_id is None:
        cluster_id = instance.cluster.id
    if cluster_id is None:
        raise Exception("no cluster id found")

    # try 100 times to find free filename
    # but should not take more than 1 try
    for _i in range(0, 100):
        ret_path = default_storage.generate_filename(
            posixpath.join(
                "secretgraph/content_files",
                str(cluster_id),
                "%s.store"
                % secrets.token_urlsafe(
                    getattr(settings, "SECRETGRAPH_FILETOKEN_LENGTH", 50)
                ),
            )
        )
        if not default_storage.exists(ret_path):
            break
    else:
        raise FileExistsError("Unlikely event: no free filename")
    return ret_path


def default_net_limit(net, attr):
    quota = getattr(settings, attr, None)
    if callable(quota):
        return quota(net)
    return quota


class FlexidModel(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    flexid: str = models.CharField(
        max_length=36, blank=True, null=True, unique=True
    )
    flexid_cached: str = models.CharField(
        max_length=80, blank=True, null=True, unique=True, editable=False
    )
    # id + flexid + flexid_cached
    flexid_byte_size: int = 8 + 36 + 80

    class Meta:
        abstract = True


class Net(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    created: dt = models.DateTimeField(auto_now_add=True, editable=False)
    # content or cluster was updated or created, deletions are not tracked
    last_used: dt = models.DateTimeField(
        default=timezone.now, help_text=last_used_help
    )
    # if disabled: like a ban
    active: bool = models.BooleanField(blank=True, default=True, null=False)
    # quota, should be greater than ?? (saving config), can be None to disable
    quota: int = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=None,
        help_text=net_limit_help,
    )
    max_upload_size: int = models.PositiveIntegerField(
        null=True, blank=True, default=None, help_text=net_limit_help
    )
    bytes_in_use: int = models.PositiveBigIntegerField(
        null=False, blank=True, default=0, editable=False
    )
    user_name: str = models.CharField(
        max_length=255, null=True, blank=True, unique=True
    )
    primaryCluster: Cluster = models.OneToOneField(
        "Cluster",
        on_delete=models.SET_NULL,
        related_name="primaryFor",
        limit_choices_to={
            "markForDestruction": None,
            "net_id": models.F("net_id"),
        },
        null=True,
        blank=True,
    )
    clusters: models.ManyToOneRel["Cluster"]
    contents: models.ManyToOneRel["Content"]

    @staticmethod
    def _size_tags(net_id) -> int:
        # exclude freeze, immutable from size calculation
        tags = (
            ContentTag.objects.filter(content__net_id=net_id)
            .exclude(tag__in=["freeze", "immutable"])
            .annotate(size=Length("tag"))
            .aggregate(size_sum=models.Sum("size"))
        )
        return tags["size_sum"] or 0

    @staticmethod
    def _size_references(net_id) -> int:
        refs = (
            ContentReference.objects.filter(content__net_id=net_id)
            .annotate(size=Length("extra"))
            .aggregate(size_sum=models.Sum("size"), count=models.Count("id"))
        )
        # include target id size and group field
        return (refs["size_sum"] or 0) + refs["count"] * 28

    def calculate_bytes_in_use(self):
        # should be used with locked net and in transaction
        # or with nets, clusters, contents not in use e.g. maintainance work
        # clusters are easy
        aclusters = self.clusters.annotate(
            size=Length("description").aggregate(
                size_sum=models.Sum("size"), count=models.Count("id")
            )
        )
        size = (aclusters["size_sum"] or 0) + aclusters[
            "count"
        ] * FlexidModel.flexid_byte_size

        # contents are complicated
        for c in self.contents.all():
            size += c.size_file + FlexidModel.flexid_byte_size
        size += self._size_tags(self.id)
        size += self._size_references(self.id)
        return size

    def reset_quota(self):
        self.quota = default_net_limit(self, "SECRETGRAPH_QUOTA")

    def reset_max_upload_size(self):
        self.max_upload_size = default_net_limit(
            self, "SECRETGRAPH_MAX_UPLOAD"
        )

    def recalculate_bytes_in_use(self, context=transaction.atomic):
        if callable(context):
            context = context()
        with context:
            obj: Net = self.objects.select_for_update().get(id=self.id)
            obj.bytes_in_use = obj.calculate_bytes_in_use()
            obj.save(update_fields=["bytes_in_use"])

    @property
    def properties(self) -> list[str]:
        if not self.id:
            return SGroupProperty.objects.defaultNetProperties().values_list(
                "name", flat=True
            )
        return SGroupProperty.objects.filter(netGroups__nets=self).values_list(
            "name", flat=True
        )

    @cached_property
    def user(self) -> Optional[usermodel]:
        username = self.user_name
        if not username:
            return None
        if usermodel:
            return usermodel.objects.filter(
                **{usermodel.USERNAME_FIELD: username}
            ).first()
        return None

    def __repr__(self) -> str:
        if self.primaryCluster and self.primaryCluster.name == "@system":
            return "<Systemnet>"
        userrepr = ", no user assigned"
        user = self.user
        if user:
            if not isinstance(user, str):
                user = repr(user)
            userrepr = f", user({user})"
        elif self.user_name:
            userrepr = f", user?({self.user_name})"
        return "<Net: id(%s)%s%s>" % (
            self.id,
            userrepr,
            ", active" if self.active else "",
        )


class Cluster(FlexidModel):
    # not a field but an attribute for restricting view
    limited: bool = False
    # not a field but an attribute for reducing dependencies
    reduced: bool = False
    name: str = models.CharField(
        max_length=181,
        default="",
        null=False,
        blank=True,
        validators=[SafeNameValidator()],
    )
    # provides uniqueness to global name and is a speedup
    name_cached: str = models.CharField(
        max_length=252, blank=True, null=True, unique=True, editable=False
    )
    description: str = models.TextField(
        default="",
        null=False,
        blank=True,
    )

    markForDestruction: dt = models.DateTimeField(null=True, blank=True)
    globalNameRegisteredAt: dt = models.DateTimeField(null=True, blank=True)
    featured: bool = models.BooleanField(default=False, blank=True, null=False)
    updated: dt = models.DateTimeField(auto_now=True, editable=False)
    updateId: UUID = models.UUIDField(blank=True, default=uuid4)

    net: Net = models.ForeignKey(
        Net, on_delete=models.CASCADE, related_name="clusters"
    )
    primaryFor: models.OneToOneRel[Net]
    groups: models.ManyToManyRel["ClusterGroup"]

    @property
    def size(self) -> int:
        size = len(self.description) + FlexidModel.flexid_byte_size
        return size

    @property
    def is_primary(self) -> bool:
        return hasattr(self, "primaryFor")

    @property
    def properties(self) -> list[str]:
        if not self.id:
            return (
                SGroupProperty.objects.defaultClusterProperties().values_list(
                    "name", flat=True
                )
            )
        return SGroupProperty.objects.filter(
            clusterGroups__clusters=self
        ).values_list("name", flat=True)

    @property
    def nonhidden_properties(self) -> list[str]:
        if not self.id:
            return (
                SGroupProperty.objects.defaultClusterProperties().values_list(
                    "name", flat=True
                )
            )
        return SGroupProperty.objects.filter(
            clusterGroups__in=self.groups.filter(hidden=False)
        ).values_list("name", flat=True)

    def clean(self) -> None:
        if not self.globalNameRegisteredAt and self.featured:
            self.featured = False

        if self.globalNameRegisteredAt is not None or self.name == "@system":
            cached_name = relay.to_base64("Cluster", self.name)
            if self.name_cached != cached_name:
                self.name_cached = cached_name
        else:
            if self.name_cached:
                self.name_cached = None
        if self.globalNameRegisteredAt is None and self.name.startswith("@"):
            if self.name != "@system":
                raise ValidationError({"globalNameRegisteredAt": "required"})
        if self.globalNameRegisteredAt is not None and (
            not self.name.startswith("@") or self.name == "@system"
        ):
            self.globalNameRegisteredAt = None
        primary = getattr(self, "primaryFor", None)
        if primary and primary != self.net:
            raise ValidationError(
                {"net": "cannot move cluster with primary mark"}
            )
        return super().clean()

    def __str__(self) -> str:
        return self.name if self.name.startswith("@") else self.flexid

    def __repr__(self) -> str:
        if self.name == "@system":
            return "<Systemcluster>"
        return "<Cluster: id(%s), net(%s), name(%s), flexid(%s)%s>" % (
            self.id,
            getattr(self, "net_id", "?"),
            self.name,
            self.flexid,
            ", featured" if self.featured else "",
        )


class ContentManager(models.Manager):
    def _get_q_required_keys(self, cluster):
        return models.Q(cluster=cluster, state="required", type="PublicKey")

    def _get_q_injected_keys(
        self,
        /,
        groups: Optional[Union[Cluster, Content, str, Iterable[str]]] = None,
        states: Optional[Iterable[str]] = None,
    ):
        q = models.Q(cluster_id=0)
        if not states:
            states = constants.public_states
        q &= models.Q(state__in=states)
        if isinstance(groups, (Cluster, Content)):
            groups = models.Subquery(groups.groups.values("name"))
        if groups:
            if isinstance(groups, str):
                groups = [groups]
            return q & models.Q(injectedFor__name__in=groups)
        else:
            return q & models.Q(injectedFor__isnull=False)

    def trusted_keys(self, cluster: Cluster):
        return self.get_queryset().filter(
            cluster=cluster,
            state__in=["trusted", "required"],
            type="PublicKey",
        )

    def injected_keys(
        self,
        /,
        groups: Optional[Union[Cluster, Content, str, Iterable[str]]] = None,
        states=None,
    ):
        return self.get_queryset().filter(
            self._get_q_injected_keys(groups, states)
        )

    def required_keys(self, cluster: Cluster):
        return self.get_queryset().filter(self._get_q_required_keys(cluster))

    def required_keys_full(
        self,
        cluster: Cluster,
    ):
        # union would prevent many features like annotate
        return self.get_queryset().filter(
            self._get_q_required_keys(cluster)
            | self._get_q_injected_keys(groups=cluster)
        )

    def global_documents(self, ignoreStates=False):
        query = self.filter(
            cluster__name="@system",
            type__in=("File", "Text"),
        ).annotate(
            limited=models.Value(True)  # no access to cluster for unprivileged
        )
        if not ignoreStates:
            query = query.filter(
                markForDestruction__isnull=True, hidden=False, state="public"
            )
        return query


class Content(FlexidModel):
    # not a field but an attribute for restricting view
    limited: bool = False
    # not a field but an attribute for reducing dependencies
    reduced: bool = False
    updated: dt = models.DateTimeField(auto_now=True, editable=False)
    updateId: UUID = models.UUIDField(blank=True, default=uuid4)
    downloadId: str = models.CharField(
        max_length=36, blank=True, null=True, unique=True
    )
    markForDestruction: dt = models.DateTimeField(null=True, blank=True)
    # doesn't appear in non-admin searches
    hidden: bool = models.BooleanField(blank=True, default=False)

    nonce: str = models.CharField(
        max_length=255, null=False, blank=True, default=""
    )
    # can decrypt = correct key
    file: File = models.FileField(upload_to=get_content_file_path)
    # internal field for orphan calculation and storage priorization
    file_accessed: dt = models.DateTimeField(null=True)
    # unique hash for content, e.g. generated from some tags
    # null if multiple contents are allowed
    contentHash: str = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        validators=[ContentHashValidator()],
    )
    net: Net = models.ForeignKey(
        Net, on_delete=models.CASCADE, related_name="contents"
    )
    cluster: Cluster = models.ForeignKey(
        Cluster,
        on_delete=models.RESTRICT,
        related_name="contents",
        limit_choices_to={"markForDestruction": None},
    )
    # group virtual injection group attribute

    type: str = models.CharField(
        max_length=50,
        null=False,
        validators=[TypeAndGroupValidator(), MinLengthValidator(1)],
    )
    state: str = models.CharField(max_length=10, null=False)

    objects = ContentManager()
    references: models.ManyToOneRel["ContentReference"]
    referencedBy: models.ManyToOneRel["ContentReference"]

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["contentHash", "cluster_id"], name="unique_content"
            )
        ]
        # Causes errors, so keep it disabled
        # order_with_respect_to = "cluster"

    def load_pubkey(self):
        """Works only for public keys (special Content)"""
        if self.type != "PrivateKey" and self.type != "PublicKey":
            return None
        if self.type == "PublicKey":
            try:
                return load_der_public_key(self.value.open("rb").read())
            except Exception as exc:
                logger.error("Could not load public key", exc_info=exc)
        else:
            pubkey = ContentReference.objects.filter(
                source_id=self.id, group="public_key"
            ).first()
            if pubkey:
                pubkey = pubkey.target
                try:
                    return load_der_public_key(pubkey.value.open("rb").read())
                except Exception as exc:
                    logger.error("Could not load public key", exc_info=exc)
        return None

    @cached_property
    def is_mutable(self) -> bool:
        if self.type == "PublicKey":
            return False
        if self.tags.filter(tag="immutable").exists():
            return False
        return True

    @property
    def properties(self) -> list[str]:
        return self.cluster.properties

    @property
    def nonhidden_properties(self) -> list[str]:
        return self.cluster.nonhidden_properties

    @property
    def needs_signature(self) -> bool:
        return (
            self.type not in constants.keyTypes  # required for bootstrapping
            and self.cluster.name != "@system"  # pages have no signature
        )

    @property
    def link(self) -> str:
        # path to raw view
        return reverse("secretgraph:contents", kwargs={"id": self.downloadId})

    @property
    def size_file(self) -> int:
        file_size = 0
        try:
            file_size = self.file.size
        except Exception as exc:
            logger.warning("Could not determinate file size", exc_info=exc)
        return file_size

    @property
    def size_tags(self) -> int:
        # exclude freeze, immutable from size calculation
        tags = (
            self.tags.exclude(tag__in=["freeze", "immutable"])
            .annotate(size=Length("tag"))
            .aggregate(size_sum=models.Sum("size"))
        )
        return tags["size_sum"] or 0

    @property
    def size_references(self) -> int:
        refs = self.references.annotate(size=Length("extra")).aggregate(
            size_sum=models.Sum("size"), count=models.Count("id")
        )
        # include target id size and group field
        return (refs["size_sum"] or 0) + refs["count"] * 28

    @property
    def size(self) -> int:
        size = self.size_file + self.flexid_byte_size
        size += self.size_tags
        size += self.size_references
        return size

    def get_absolute_url(self):
        return self.link

    def signatures(
        self, hashAlgorithms=None, references=None
    ) -> Iterable[str]:
        q = models.Q()
        q2 = models.Q()
        if references:
            references = references.filter(source__id=self.id)
        else:
            references = self.references
        if hashAlgorithms:
            for algo in hashAlgorithms:
                q |= models.Q(tag__startswith=f"signature={algo=}")
                q2 |= models.Q(extra__startswith=f"{algo}=")
        else:
            q = models.Q(tag__startswith="signature=")
        return chain(
            self.tags.filter(q)
            .annotate(signature=Substr("tag", 10))
            .values_list("signature"),
            references.filter(q2, group="signature")
            .annotate(
                signature=Concat(
                    "extra", models.Value("="), "target__contentHash"
                )
            )
            .values_list("signature"),
        )

    def clean(self) -> None:
        if self.type == "PrivateKey":
            if self.state != "protected":
                raise ValidationError(
                    {
                        "state": "%s is an invalid state for private key"
                        % self.state
                    }
                )
        elif self.type == "PublicKey":
            if self.state not in constants.publickey_states:
                raise ValidationError(
                    {
                        "state": "%s is an invalid state for public key"
                        % self.state
                    }
                )
            if not self.contentHash or not self.contentHash.startswith("Key:"):
                raise ValidationError(
                    {
                        "contentHash": (
                            "%s is an invalid "
                            "contentHash for public key. Needs domain: Key:"
                        )
                        % self.contentHash
                    }
                )
        else:
            if self.type == "Config" and self.state != "protected":
                raise ValidationError(
                    {"state": "%s is an invalid state for Config" % self.state}
                )
            elif self.state not in constants.nonkey_content_states:
                raise ValidationError(
                    {
                        "state": "%s is an invalid state for content"
                        % self.state
                    }
                )
        if self.state not in constants.public_states and not self.nonce:
            raise ValidationError({"nonce": "nonce empty"})

    def __str__(self) -> str:
        return self.flexid

    def __repr__(self) -> str:
        return (
            "<Content: id(%s), cluster(%s), net(%s), type(%s), state(%s), flexid(%s)%s>"  # noqa E501
            % (
                self.id,
                getattr(self, "cluster_id", "?"),
                getattr(self, "net_id", "?"),
                self.type,
                self.state,
                self.flexid,
                ", hidden" if self.hidden else "",
            )
        )


class ContentAction(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    content: Content = models.ForeignKey(
        Content, related_name="actions", on_delete=models.CASCADE
    )
    group: str = models.CharField(
        max_length=20,
        null=False,
        default="",
        blank=True,
        help_text=contentaction_group_help,
        validators=[TypeAndGroupValidator()],
    )
    action: Action = models.OneToOneField(
        "Action",
        related_name="contentAction",
        on_delete=models.CASCADE,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["content", "group"], name="%(class)s_unique"
            ),
        ]

    def __repr__(self) -> str:
        return '<ContentAction: (%r:"%s")>' % (self.content, self.group)


class Action(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    cluster: Cluster = models.ForeignKey(
        Cluster, on_delete=models.CASCADE, related_name="actions"
    )
    used: dt = models.DateTimeField(null=True, blank=True)
    keyHash: str = models.CharField(
        max_length=255,
        validators=[ActionKeyHashValidator()],
    )
    nonce: str = models.CharField(max_length=255)
    # value returns json with required encrypted aes key
    value: Union[bytes, memoryview] = models.BinaryField(
        null=False, blank=False
    )
    start: dt = models.DateTimeField(default=timezone.now, blank=True)
    stop: dt = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(start__lte=models.F("stop"))
                | models.Q(stop__isnull=True),
                name="%(class)s_order",
            ),
            models.CheckConstraint(
                check=models.Q(start__isnull=False)
                | models.Q(stop__isnull=False),
                name="%(class)s_exist",
            ),
        ]

    def decrypt(self, key: str | bytes):
        if isinstance(key, str):
            key = base64.b64decode(key)
        return self.decrypt_aesgcm(AESGCM(key))

    def decrypt_aesgcm(self, aesgcm: AESGCM):
        action_value = self.value
        # cryptography doesn't support memoryview
        if isinstance(action_value, memoryview):
            action_value = action_value.tobytes()
        return json.loads(
            aesgcm.decrypt(base64.b64decode(self.nonce), action_value, None)
        )

    def __str__(self) -> str:
        return self.keyHash

    def __repr__(self) -> str:
        return "<Action: (id: %s, keyHash: %s, Cluster: %s)>" % (
            self.id,
            self.keyHash,
            self.cluster,
        )


class ContentTag(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    content: Content = models.ForeignKey(
        Content, related_name="tags", on_delete=models.CASCADE
    )
    # searchable tag content
    tag: str = models.TextField(blank=False, null=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["content", "tag"], name="unique_content_tag"
            ),
        ]

    def __str__(self):
        return self.tag

    def __repr__(self):
        return f"<ContentTag: {self}>"


DeleteRecursive = models.TextChoices(
    "DeleteRecursive",
    map(
        lambda x: (x[0], x[1].value),
        constants.DeleteRecursive.__members__.items(),
    ),
)


UserSelectable = models.TextChoices(
    "UserSelectable",
    map(
        lambda x: (x[0], x[1].value),
        constants.UserSelectable.__members__.items(),
    ),
)


class ContentReference(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    source: Content = models.ForeignKey(
        Content,
        related_name="references",
        on_delete=models.CASCADE,
    )
    target: Content = models.ForeignKey(
        Content, related_name="referencedBy", on_delete=models.CASCADE
    )
    group: str = models.CharField(
        max_length=20,
        default="",
        null=False,
        blank=True,
        help_text=reference_group_help,
        validators=[TypeAndGroupValidator()],
    )
    extra: str = models.TextField(blank=True, null=False, default="")

    deleteRecursive: str = models.CharField(
        blank=True,
        default=constants.DeleteRecursive.TRUE.value,
        null=False,
        max_length=1,
        choices=DeleteRecursive.choices,
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=~models.Q(source=models.F("target")),
                name="%(class)s_no_self_ref",
            ),
            models.CheckConstraint(
                check=(
                    ~(models.Q(group="key") | models.Q(group="transfer"))
                    | models.Q(deleteRecursive=DeleteRecursive.NO_GROUP.value)
                ),
                name="%(class)s_key",
            ),
            models.UniqueConstraint(
                fields=["source", "target", "group"], name="%(class)s_unique"
            ),
        ]

    def __repr__(self):
        return '<ContentReference: (%r:"%s":%r)>' % (
            self.source,
            self.group,
            self.target,
        )


class SGroupPropertyManager(models.Manager):
    def defaultNetProperties(self, queryset=None) -> models.QuerySet:
        if queryset is None:
            queryset = self.get_queryset()

        dProperty = SGroupProperty.objects.get_or_create(
            name="default", defaults={}
        )[0]
        default_ngroups = dProperty.netGroups.all()
        return queryset.filter(netGroups__in=default_ngroups)

    def defaultClusterProperties(self, queryset=None) -> models.QuerySet:
        if queryset is None:
            queryset = self.get_queryset()

        dProperty = SGroupProperty.objects.get_or_create(
            name="default", defaults={}
        )[0]
        default_cgroups = dProperty.clusterGroups.all()
        return queryset.filter(clusterGroups__in=default_cgroups)


# e.g. auto_hide = contents are automatically hidden and manually
class SGroupProperty(models.Model):
    # there are just few of them
    id: int = models.AutoField(primary_key=True, editable=False)
    name: str = models.CharField(
        max_length=50,
        null=False,
        unique=True,
        validators=[SafeNameValidator(), MinLengthValidator(1)],
    )
    clusterGroups: models.ManyToManyRel["ClusterGroup"]
    netGroups: models.ManyToManyRel["NetGroup"]

    objects = SGroupPropertyManager()

    def __str__(self) -> str:
        return self.name


class NetGroup(models.Model):
    # there are just few of them
    id: int = models.AutoField(primary_key=True, editable=False)
    name: str = models.CharField(
        max_length=50,
        null=False,
        unique=True,
        validators=[SafeNameValidator(), MinLengthValidator(1)],
    )
    description: str = models.TextField()
    userSelectable: str = models.CharField(
        blank=True,
        default=constants.UserSelectable.NONE.value,
        null=False,
        max_length=1,
        choices=UserSelectable.choices,
    )
    nets: models.ManyToManyField[Net] = models.ManyToManyField(
        Net,
        related_name="groups",
        help_text=net_groups_help,
    )
    properties: models.ManyToManyField[
        SGroupProperty
    ] = models.ManyToManyField(SGroupProperty, related_name="netGroups")

    def __str__(self) -> str:
        return self.name

    def __repr__(self) -> str:
        return "<NetGroup: %s>" % (self.name,)

    @property
    def is_managed(self) -> bool:
        return bool(
            settings.SECRETGRAPH_DEFAULT_NET_GROUPS.get(self.name, {}).get(
                "managed"
            )
        )


class ClusterGroup(models.Model):
    # there are just few of them
    id: int = models.AutoField(primary_key=True, editable=False)
    name: str = models.CharField(
        max_length=50,
        null=False,
        unique=True,
        validators=[SafeNameValidator(), MinLengthValidator(1)],
    )
    description: str = models.TextField()
    userSelectable: str = models.CharField(
        blank=True,
        default=constants.UserSelectable.NONE.value,
        null=False,
        max_length=1,
        choices=UserSelectable.choices,
    )
    # don't show in groups, mutual exclusive to keys
    hidden: bool = models.BooleanField(default=False, blank=True)
    clusters: models.ManyToManyField[Cluster] = models.ManyToManyField(
        Cluster,
        related_name="groups",
        help_text=cluster_groups_help,
    )
    injectedKeys: models.ManyToManyField[Content] = models.ManyToManyField(
        Content,
        related_name="injectedFor",
        limit_choices_to={
            "type": "PublicKey",
            "cluster_id": 0,
        },
    )
    properties: models.ManyToManyField[
        SGroupProperty
    ] = models.ManyToManyField(
        SGroupProperty,
        related_name="clusterGroups",
        limit_choices_to=~models.Q(name__startswith="manage_"),
    )

    def clean(self):
        if self.hidden and self.injectedKeys.exists():
            raise ValidationError(
                {"hidden": "injectedKeys and hidden are mutual exclusive"}
            )

    def __str__(self) -> str:
        return self.name

    def __repr__(self) -> str:
        return "<ClusterGroup: %s%s>" % (
            self.name,
            ", hidden" if self.hidden else "",
        )

    @property
    def is_managed(self) -> bool:
        return bool(
            settings.SECRETGRAPH_DEFAULT_CLUSTER_GROUPS.get(self.name, {}).get(
                "managed"
            )
        )
