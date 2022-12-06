from __future__ import annotations

import logging
import posixpath
import secrets
from datetime import datetime as dt
from itertools import chain
from uuid import UUID, uuid4
from typing import Iterable, Union
from strawberry_django_plus import relay

from cryptography.hazmat.primitives.serialization import load_der_public_key
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import File
from django.core.validators import MinLengthValidator
from django.core.cache import caches
from django.core.files.storage import default_storage
from django.db import models
from django.db.models.functions import Concat, Substr, Length
from django.urls import reverse
from django.utils import timezone

from .messages import (
    contentaction_group_help,
    cluster_groups_help,
    reference_group_help,
    net_quota_help,
    last_used_help,
)
from .validators import (
    ActionKeyHashValidator,
    SafeNameValidator,
    ContentHashValidator,
    TypeAndGroupValidator,
)
from ..core import constants

logger = logging.getLogger(__name__)


def get_content_file_path(instance, filename) -> str:
    cluster_id = instance.cluster_id or instance.cluster.id
    if not cluster_id:
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
                    getattr(settings, "SECRETGRAPH_FILETOKEN_LENGTH", 100)
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
        max_length=80, blank=True, null=True, unique=True
    )

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
        help_text=net_quota_help,
    )
    max_upload_size: int = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=None,
    )
    bytes_in_use: int = models.PositiveBigIntegerField(
        null=False,
        blank=True,
        default=0,
    )
    clusters: models.ManyToOneRel["Cluster"]
    contents: models.ManyToOneRel["Content"]

    if getattr(settings, "AUTH_USER_MODEL", None) or getattr(
        settings, "SECRETGRAPH_BIND_TO_USER", False
    ):
        user = models.OneToOneField(
            settings.AUTH_USER_MODEL,
            on_delete=models.CASCADE,
            null=True,
            blank=True,
            related_name="secretgraph_net",
        )

    def reset_quota(self):
        self.quota = default_net_limit(self, "SECRETGRAPH_QUOTA")

    def reset_max_upload_size(self):
        self.max_upload_size = default_net_limit(
            self, "SECRETGRAPH_MAX_UPLOAD"
        )

    def __repr__(self) -> str:
        userrepr = ""
        if getattr(settings, "AUTH_USER_MODEL", None) or getattr(
            settings, "SECRETGRAPH_BIND_TO_USER", False
        ):
            userrepr = ", no user assigned"
            user = getattr(self, "user", None)
            if user:
                userrepr = f", user({user!r})"
        return "<Net: id(%s)%s%s>" % (
            self.id,
            userrepr,
            ", active" if self.active else "",
        )


class Cluster(FlexidModel):
    # not a field but an attribute for restricting view
    limited = False
    name: str = models.CharField(
        max_length=181,
        default="",
        null=False,
        blank=True,
        validators=[SafeNameValidator],
    )
    # provides uniqueness to global name and is a speedup
    name_cached: str = models.CharField(
        max_length=252, blank=True, null=True, unique=True
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
    groups: models.ManyToManyRel["GlobalGroup"]

    @property
    def size(self) -> int:
        size = len(self.description)
        return size

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
        return super().clean()

    def __repr__(self) -> str:
        return "<Cluster: id(%s), name(%s), flexid(%s)%s>" % (
            self.id,
            self.name,
            self.flexid,
            ", featured" if self.featured else "",
        )


class ContentManager(models.Manager):
    def required_keys_full(
        self,
        cluster,
    ):
        return self.required_keys(cluster).union(
            self.injected_keys(groups=cluster)
        )

    def trusted_keys(self, cluster):
        return self.get_queryset().filter(
            cluster=cluster,
            state__in=["trusted", "required"],
            type="PublicKey",
        )

    def required_keys(self, cluster):
        return self.get_queryset().filter(
            cluster=cluster, state="required", type="PublicKey"
        )

    def injected_keys(self, /, groups=None, states=None):
        queryset = self.get_queryset().filter(cluster_id=0)
        if not states:
            states = constants.public_states
        queryset = queryset.filter(state__in=states)
        if isinstance(groups, (Cluster, Content)):
            groups = models.Subquery(groups.groups.values("name"))
        if groups:
            if isinstance(groups, str):
                groups = [groups]
            return queryset.filter(injectedFor__name__in=groups)
        else:
            return queryset.filter(injectedFor__isnull=False)


class Content(FlexidModel):
    limited: bool = False
    updated: dt = models.DateTimeField(auto_now=True, editable=False)
    updateId: UUID = models.UUIDField(blank=True, default=uuid4)
    markForDestruction: dt = models.DateTimeField(null=True, blank=True)
    # doesn't appear in non-admin searches
    hidden: bool = models.BooleanField(blank=True, default=False)

    nonce: str = models.CharField(
        max_length=255, null=False, blank=True, default=""
    )
    # can decrypt = correct key
    file: File = models.FileField(upload_to=get_content_file_path)
    # unique hash for content, e.g. generated from some tags
    # null if multiple contents are allowed
    contentHash: str = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        validators=[ContentHashValidator],
    )
    net: Net = models.ForeignKey(
        Net, on_delete=models.CASCADE, related_name="contents"
    )
    cluster: Cluster = models.ForeignKey(
        Cluster, on_delete=models.CASCADE, related_name="contents"
    )
    # group virtual injection group attribute

    type: str = models.CharField(
        max_length=50,
        null=False,
        validators=[TypeAndGroupValidator, MinLengthValidator(1)],
    )
    state: str = models.CharField(max_length=10, null=False)

    objects = ContentManager()

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

    @property
    def link(self) -> str:
        # path to raw view
        return reverse("secretgraph:contents", kwargs={"id": self.flexid})

    @property
    def size_tags(self) -> int:
        # exclude freeze, immutable from size calculation
        tags = (
            self.tags.exclude(tag__in=["freeze", "immutable"])
            .annotate(size=Length("tag"))
            .aggregate(size_sum=models.Sum("size"))
        )
        return tags["size_sum"]

    @property
    def size_references(self) -> int:
        refs = self.references.annotate(size=Length("extra")).aggregate(
            size_sum=models.Sum("size"), count=models.Count("id")
        )
        # include target id size and group field
        return refs["size_sum"] + refs["count"] * 28

    @property
    def size(self) -> int:
        size = self.file.size
        size += self.size_tags
        size += self.size_references
        return size

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
                            "%(contentHash)s is an invalid"
                            "contentHash for public key. Needs domain: Key:"
                        )
                    },
                    params={"contentHash": self.contentHash},
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

    def __repr__(self) -> str:
        return "<Content: type(%s), state(%s), flexid(%s)%s>" % (
            self.type,
            self.state,
            self.flexid,
            ", hidden" if self.hidden else "",
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
        validators=[TypeAndGroupValidator],
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
        validators=[ActionKeyHashValidator],
    )
    nonce: str = models.CharField(max_length=255)
    # value returns json with required encrypted aes key
    value: Union[bytes, memoryview] = models.BinaryField(
        null=False, blank=False
    )
    start: dt = models.DateTimeField(default=timezone.now, blank=True)
    stop: dt = models.DateTimeField(blank=True, null=True)
    contentAction: ContentAction = models.OneToOneField(
        ContentAction,
        related_name="action",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )

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
        validators=[TypeAndGroupValidator],
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


class GlobalGroupManager(models.Manager):
    def hidden(self, queryset=None) -> models.QuerySet[GlobalGroup]:
        if queryset is None:
            queryset = self.get_queryset()
        return queryset.filter(hidden=True)

    def _get_hidden_names(self):
        return set(self.hidden().values_list("name", flat=True))

    def get_hidden_names(self):
        return caches["secretgraph_settings"].get_or_set(
            "hidden_groups", self._get_hidden_names
        )

    def visible(self, queryset=None):
        if queryset is None:
            queryset = self.get_queryset()
        return queryset.filter(hidden=False)


# e.g. auto_hide = contents are automatically hidden and manually
class GlobalGroupProperty(models.Model):
    # there are just few of them
    id: int = models.AutoField(primary_key=True, editable=False)
    name: str = models.CharField(
        max_length=50,
        null=False,
        unique=True,
        validators=[SafeNameValidator, MinLengthValidator(1)],
    )

    def __str__(self) -> str:
        return self.name


class GlobalGroup(models.Model):
    # there are just few of them
    id: int = models.AutoField(primary_key=True, editable=False)
    name: str = models.CharField(
        max_length=50,
        null=False,
        unique=True,
        validators=[SafeNameValidator, MinLengthValidator(1)],
    )
    description: str = models.TextField()
    # don't show in groups, mutual exclusive to keys
    hidden: bool = models.BooleanField(default=False, blank=True)
    matchUserGroup: bool = models.BooleanField(default=False, blank=True)
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
        GlobalGroupProperty
    ] = models.ManyToManyField(GlobalGroupProperty, related_name="groups")

    objects = GlobalGroupManager()

    def clean(self):
        if self.hidden and self.injectedKeys.exists():
            raise ValidationError(
                {"hidden": "injectedKeys and hidden are mutual exclusive"}
            )

    def __repr__(self) -> str:
        return "<GlobalGroup: %s%s>" % (
            self.name,
            ", hidden" if self.hidden else "",
        )
