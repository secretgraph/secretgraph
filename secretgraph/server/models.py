
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


class Component(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    flexid = models.UUIDField(default=None, blank=True, null=True)
    public_info: str = models.TextField()

    if getattr(settings, "SECRETGRAPH_BIND_TO_USER", False):
        user = models.ForeignKey(
            settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
            null=True, blank=True
        )


class Content(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    nonce: str = models.CharField(max_length=255)
    component: Component = models.ForeignKey(
        Component, on_delete=models.CASCADE,
    )


class ReferenceContent(models.Model):
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


class ContentValue(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    content: Content = models.ForeignKey(
        Content, on_delete=models.CASCADE, related_name="values"
    )
    updated: dt = models.DateTimeField(auto_now=True, editable=False)
    name: str = models.CharField(max_length=255)
    # used as nonce in connection with a file attribute
    value: str = models.TextField(null=True, blank=True)
    # extern content pushed, can only use file
    file: File = models.FileField(
        upload_to=get_file_path, null=True, blank=True
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(value__isnull=False, file__isnull=True) |
                    models.Q(value__isnull=False, file__isnull=False)
                ),
                name="%(class)s_only_one_val"
            ),
        ]


class Action(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    component: Component = models.ForeignKey(
        Component, on_delete=models.CASCADE, related_name="actions"
    )
    keyhash: str = models.CharField(max_length=255)
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
