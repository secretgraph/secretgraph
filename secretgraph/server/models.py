import logging
import posixpath
import secrets
from datetime import datetime as dt
from typing import Optional
from uuid import UUID

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.serialization import load_der_public_key
from django.conf import settings
from django.core.files.base import File
from django.core.files.storage import default_storage
from django.db import models
from django.utils import timezone


logger = logging.getLogger(__name__)


def get_file_path(instance, filename) -> str:
    ret = getattr(settings, "SECRETGRAPH_FILE_DIR", "content_files")
    # try 100 times to find free filename
    # but should not take more than 1 try
    for _i in range(0, 100):
        ret_path = default_storage.generate_filename(
            posixpath.join(
                ret, str(instance.cluster_id),
                "%s.store" % secrets.token_urlsafe(
                    getattr(settings, "SECRETGRAPH_FILETOKEN_LEN")
                )
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
    publicInfo: str = models.TextField(db_column="public_info")
    # internal field for listing public clusters
    public: bool = models.BooleanField(default=False, blank=True)
    featured: bool = models.BooleanField(default=False, blank=True)
    group: int = models.SmallIntegerField(default=0)

    if (
        getattr(settings, "AUTH_USER_MODEL", None) or
        getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
    ):
        user = models.ForeignKey(
            settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
            null=True, blank=True, related_name="clusters"
        )


class ContentManager(models.Manager):
    def injected_keys(self, queryset=None):
        if queryset is None:
            queryset = self.get_queryset()
        return queryset.filter(
            info__tag="PublicKey",
            cluster__in=getattr(
                settings, "SECRETGRAPH_INJECT_CLUSTERS", None
            ) or []
        )


class Content(FlexidModel):
    updated: dt = models.DateTimeField(auto_now=True, editable=False)
    markForDestruction: dt = models.DateTimeField(
        null=True, blank=True,
        db_column="mark_for_destruction"
    )

    nonce: str = models.CharField(max_length=255)
    # can decrypt = correct key
    file: File = models.FileField(
        upload_to=get_file_path
    )
    # unique hash for content, e.g. generated from some info tags
    # null if multiple contents are allowed
    contentHash: str = models.CharField(
        max_length=255, blank=True, null=True,
        db_column="content_hash"
    )
    cluster: Cluster = models.ForeignKey(
        Cluster, on_delete=models.CASCADE, related_name="contents"
    )

    objects = ContentManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["contentHash", "cluster_id"],
                name="unique_content"
            )
        ]

    def load_pubkey(self):
        """ Works only for public keys (special Content) """
        try:
            return load_der_public_key(
                self.value.open("rb").read(),
                default_backend()
            )
        except Exception as exc:
            logger.error("Could not load public key", exc_info=exc)
        return None


class ContentAction(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    content: Content = models.ForeignKey(
        Content, related_name="actions",
        on_delete=models.CASCADE
    )
    used: bool = models.BooleanField(default=False, blank=True)
    group: str = models.CharField(
        max_length=255, null=False, default="", blank=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["content", "group"],
                name="%(class)s_unique"
            ),
        ]


class Action(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    cluster: Cluster = models.ForeignKey(
        Cluster, on_delete=models.CASCADE, related_name="actions"
    )
    keyHash: str = models.CharField(
        max_length=255,
        db_column="key_hash"
    )
    nonce: str = models.CharField(max_length=255)
    # value returns json with required encrypted aes key
    value: bytes = models.BinaryField(null=False, blank=False)
    start: dt = models.DateTimeField(default=timezone.now, blank=True)
    stop: dt = models.DateTimeField(blank=True, null=True)
    contentAction: ContentAction = models.OneToOneField(
        ContentAction, related_name="action",
        on_delete=models.CASCADE, null=True, blank=True,
        db_column="content_action"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(
                    start__lte=models.F("stop")
                ) |
                models.Q(stop__isnull=True),
                name="%(class)s_order"
            ),
            models.CheckConstraint(
                check=models.Q(
                    start__isnull=False
                ) |
                models.Q(
                    stop__isnull=False
                ),
                name="%(class)s_exist"
            )
        ]


class ContentTag(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    content: Content = models.ForeignKey(
        Content, related_name="info",
        on_delete=models.CASCADE
    )
    # searchable info
    tag: str = models.TextField(blank=False, null=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["content", "tag"],
                name="unique_content_tag"
            ),
        ]


class ContentReference(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    source: Content = models.ForeignKey(
        Content, related_name="references",
        on_delete=models.CASCADE,
    )
    target: Content = models.ForeignKey(
        Content, related_name="referencedBy",
        on_delete=models.CASCADE
    )
    group: str = models.CharField(
        max_length=255, default='', null=False, blank=True
    )
    extra: str = models.TextField(blank=True, null=False, default='')
    deleteRecursive: Optional[bool] = models.BooleanField(
        blank=True, default=True, null=True,
        db_column="delete_recursive"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=~models.Q(source=models.F("target")),
                name="%(class)s_no_self_ref"
            ),
            models.CheckConstraint(
                check=(
                    ~(
                        models.Q(group="key") |
                        models.Q(group="transfer")
                    )
                    | models.Q(deleteRecursive__isnull=True)
                ),
                name="%(class)s_key"
            ),
            models.UniqueConstraint(
                fields=["source", "target", "group"],
                name="%(class)s_unique"
            ),
        ]
