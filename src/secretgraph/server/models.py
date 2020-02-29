
import secrets
import posixpath

from django.db import models
from django.core.files.storage import default_storage

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
    value: bytes = models.BinaryField()

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
    source = models.ForeignKey(
        Content, related_name="references",
        on_delete=models.CASCADE,
    )
    target = models.ForeignKey(
        Content, related_name="referenced_by",
        on_delete=models.CASCADE
    )
    delete_recursive = models.BooleanField(blank=True, default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                ~models.Q(source="target"),
                name="%(class)s_no_self_ref"
            ),
        ]


class ContentValue(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    content: Content = models.ForeignKey(
        Content, on_delete=models.CASCADE,
    )
    updated = models.DateTimeField(auto_now=True)
    name: str = models.CharField(max_length=255)
    value: bytes = models.BinaryField(null=True, blank=True)
    # extern content pushed, can only use file
    file = models.FileField(upload_to=get_file_path, null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                models.Q(value__isnull=True) |
                models.Q(file__isnull=True),
                name="%(class)s_only_one_val"
            ),
        ]


class Action(models.Model):
    id: int = models.BigAutoField(primary_key=True, editable=False)
    component: Component = models.ForeignKey(
        Component, on_delete=models.CASCADE,
    )
    keyhash: str = models.CharField(max_length=255)
    nonce: str = models.CharField(max_length=255)
    # value returns ttl with required encrypted aes key
    value: bytes = models.BinaryField(null=True, blank=True)
    start = models.DateTimeField(auto_now_add=True, blank=True)
    stop = models.DateTimeField(blank=True, null=True)

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
