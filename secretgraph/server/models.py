import logging
import posixpath
import secrets
from datetime import datetime as dt
from itertools import chain
from uuid import UUID, uuid4

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.serialization import load_der_public_key
from django.conf import settings
from django.core.files.base import File
from django.core.files.storage import default_storage
from django.db import models
from django.db.models.functions import Concat, Substr
from django.urls import reverse
from django.utils import timezone

from .messages import (
    contentaction_group_help,
    injection_group_help,
    reference_group_help,
)
from .. import constants

logger = logging.getLogger(__name__)


def get_publicInfo_file_path(instance, filename) -> str:
    ret = getattr(settings, "SECRETGRAPH_FILE_DIR", "cluster_files")
    # try 100 times to find free filename
    # but should not take more than 1 try
    for _i in range(0, 100):
        ret_path = default_storage.generate_filename(
            posixpath.join(
                ret,
                "%s.info"
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


def get_content_file_path(instance, filename) -> str:
    ret = getattr(settings, "SECRETGRAPH_FILE_DIR", "content_files")
    cluster_id = instance.cluster_id or instance.cluster.id
    if not cluster_id:
        raise Exception("no cluster id found")

    # try 100 times to find free filename
    # but should not take more than 1 try
    for _i in range(0, 100):
        ret_path = default_storage.generate_filename(
            posixpath.join(
                ret,
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


class FlexidModel(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    flexid: UUID = models.UUIDField(blank=True, null=True, unique=True)

    class Meta:
        abstract = True


class Cluster(FlexidModel):
    # not a field but an attribute for restricting view
    limited = False
    publicInfo: str = models.FileField(
        upload_to=get_publicInfo_file_path, db_column="public_info"
    )
    # internal field for listing public clusters
    public: bool = models.BooleanField(default=False, blank=True)
    featured: bool = models.BooleanField(default=False, blank=True)
    updated: dt = models.DateTimeField(auto_now=True, editable=False)
    updateId: UUID = models.UUIDField(
        blank=True, default=uuid4, db_column="update_id"
    )
    # injection group (which clusters should be injected)
    group: str = models.CharField(
        default="",
        max_length=10,
        blank=True,
        null=False,
        help_text=injection_group_help,
    )
    markForDestruction: dt = models.DateTimeField(
        null=True, blank=True, db_column="mark_for_destruction"
    )

    if getattr(settings, "AUTH_USER_MODEL", None) or getattr(
        settings, "SECRETGRAPH_BIND_TO_USER", False
    ):
        user = models.ForeignKey(
            settings.AUTH_USER_MODEL,
            on_delete=models.CASCADE,
            null=True,
            blank=True,
            related_name="clusters",
        )

    @property
    def link(self):
        # path to raw view
        return reverse("secretgraph:clusters", kwargs={"id": self.flexid})


class ContentManager(models.Manager):
    def injected_keys(self, queryset=None, group=""):
        if queryset is None:
            queryset = self.get_queryset()
        return queryset.filter(
            tags__tag="PublicKey",
            cluster__in=(
                getattr(settings, "SECRETGRAPH_INJECT_CLUSTERS", None) or {}
            ).get(group, []),
        )

    def get_queryset(self):
        return (
            super().get_queryset().annotate(group=models.F("cluster__group"))
        )


class Content(FlexidModel):
    limited = False
    updated: dt = models.DateTimeField(auto_now=True, editable=False)
    updateId: UUID = models.UUIDField(
        blank=True, default=uuid4, db_column="update_id"
    )
    markForDestruction: dt = models.DateTimeField(
        null=True, blank=True, db_column="mark_for_destruction"
    )
    # doesn't appear in non-admin searches
    hidden: bool = models.BooleanField(blank=True, default=False)

    nonce: str = models.CharField(max_length=255)
    # can decrypt = correct key
    file: File = models.FileField(upload_to=get_content_file_path)
    # unique hash for content, e.g. generated from some tags
    # null if multiple contents are allowed
    contentHash: str = models.CharField(
        max_length=255, blank=True, null=True, db_column="content_hash"
    )
    cluster: Cluster = models.ForeignKey(
        Cluster, on_delete=models.CASCADE, related_name="contents"
    )
    # group virtual injection group attribute

    objects = ContentManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["contentHash", "cluster_id"], name="unique_content"
            )
        ]

    def load_pubkey(self):
        """ Works only for public keys (special Content) """
        try:
            return load_der_public_key(
                self.value.open("rb").read(), default_backend()
            )
        except Exception as exc:
            logger.error("Could not load public key", exc_info=exc)
        return None

    @property
    def link(self):
        # path to raw view
        return reverse("secretgraph:contents", kwargs={"id": self.flexid})

    def signatures(self, algos=None, references=None):
        q = models.Q()
        q2 = models.Q()
        if references:
            references = references.filter(source__id=self.id)
        else:
            references = self.references
        if algos:
            for algo in algos:
                q |= models.Q(tag__startswith=f"signature={algo=}")
                q2 |= models.Q(extra__startswith=f"{algo}=")
        else:
            q = models.Q(tag__startswith="signature=")
        return chain(
            self.tags.filter(q)
            .annotate(signature=Substr("tag", 10))
            .values_list("signature"),
            references.filter(q2, group="signature").annotate(
                signature=Concat(
                    "extra", models.Value("="), "target__contentHash"
                )
            ),
        )

    def __repr__(self):
        return "<Content: flexid(%s)>" % self.flexid


class ContentAction(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    content: Content = models.ForeignKey(
        Content, related_name="actions", on_delete=models.CASCADE
    )
    used: bool = models.BooleanField(default=False, blank=True)
    group: str = models.CharField(
        max_length=255,
        null=False,
        default="",
        blank=True,
        help_text=contentaction_group_help,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["content", "group"], name="%(class)s_unique"
            ),
        ]

    def __repr__(self):
        return '<ContentAction: (%r:"%s")>' % (self.content, self.group)


class Action(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    cluster: Cluster = models.ForeignKey(
        Cluster, on_delete=models.CASCADE, related_name="actions"
    )
    keyHash: str = models.CharField(max_length=255, db_column="key_hash")
    nonce: str = models.CharField(max_length=255)
    # value returns json with required encrypted aes key
    value: bytes = models.BinaryField(null=False, blank=False)
    start: dt = models.DateTimeField(default=timezone.now, blank=True)
    stop: dt = models.DateTimeField(blank=True, null=True)
    contentAction: ContentAction = models.OneToOneField(
        ContentAction,
        related_name="action",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        db_column="content_action",
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
        max_length=255,
        default="",
        null=False,
        blank=True,
        help_text=reference_group_help,
    )
    extra: str = models.TextField(blank=True, null=False, default="")

    deleteRecursive: str = models.CharField(
        blank=True,
        default=constants.DeleteRecursive.TRUE.value,
        null=False,
        db_column="delete_recursive",
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
                    | models.Q(deleteRecursive__isnull=True)
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
