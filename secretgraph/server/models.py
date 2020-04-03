
from uuid import UUID
import secrets
import posixpath
from datetime import datetime as dt

from django.db import models
from django.core.files.base import File
from django.core.files.storage import default_storage
from django.utils import timezone

from django.conf import settings


def get_file_path(instance, filename) -> str:
    ret = getattr(settings, "SECRETGRAPH_FILE_DIR", "spider_files")
    # try 100 times to find free filename
    # but should not take more than 1 try
    # IMPORTANT: strip . to prevent creation of htaccess files or similar
    for _i in range(0, 100):
        ret_path = default_storage.generate_filename(
            posixpath.join(
                ret, str(instance.component.id),
                "%s.store" % secrets.token_urlsafe(
                    getattr(settings, "SECRETGRAPH_KEY_SIZE")
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


class Component(FlexidModel):
    # only expose nonce when view rights
    # nonce is not changeable, only for search
    nonce: str = models.CharField(max_length=255)
    public_info: str = models.TextField()
    # internal field for listing public components
    public: bool = models.BooleanField(default=False, blank=True)

    if (
        getattr(settings, "AUTH_USER_MODEL", None) or
        getattr(settings, "SECRETGRAPH_BIND_TO_USER", False)
    ):
        user = models.ForeignKey(
            settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
            null=True, blank=True
        )


class Action(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    component: Component = models.ForeignKey(
        Component, on_delete=models.CASCADE, related_name="actions"
    )
    key_hash: str = models.CharField(max_length=255)
    nonce: str = models.CharField(max_length=255)
    # value returns ttl with required encrypted aes key
    value: bytes = models.BinaryField(null=False, blank=False)
    start: dt = models.DateTimeField(default=timezone.now, blank=True)
    stop: dt = models.DateTimeField(blank=True, null=True)

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


class Content(FlexidModel):
    # search for key_hash
    key_hash: str = models.CharField(max_length=255)
    nonce: str = models.CharField(max_length=255)
    # key unencrypt content = permission ok
    content: str = models.TextField(blank=False, null=False)
    # searchable info array
    info: str = models.TextField(blank=False, null=False)
    # hash without flags and special parameters,
    # null if multiple contents are allowed
    info_hash: str = models.CharField(max_length=255, blank=True, null=True)
    component: Component = models.ForeignKey(
        Component, on_delete=models.CASCADE,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["info_hash", "component_id"],
                name="unique_content"
            )
        ]


class ContentReference(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    source: Content = models.ForeignKey(
        Content, related_name="references",
        on_delete=models.CASCADE,
    )
    target: Content = models.ForeignKey(
        Content, related_name="referenced_by",
        on_delete=models.CASCADE
    )
    name: str = models.CharField(
        max_length=255, default="", null=False, blank=True
    )
    delete_recursive: bool = models.BooleanField(blank=True, default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=~models.Q(source=models.F("target")),
                name="%(class)s_no_self_ref"
            ),
            models.UniqueConstraint(
                fields=["source", "target", "name"],
                name="%(class)s_unique"
            ),
        ]


class ContentFile(FlexidModel):
    content: Content = models.ForeignKey(
        Content, on_delete=models.CASCADE, related_name="files"
    )
    updated: dt = models.DateTimeField(auto_now=True, editable=False)
    name: str = models.CharField(max_length=255)
    nonce: str = models.CharField(max_length=255)
    # extern content pushed, can only use file
    file: File = models.FileField(
        upload_to=get_file_path
    )

    class Meta:
        constraints = []
