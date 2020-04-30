
import uuid

from django.db import transaction, models
from django.db.utils import IntegrityError

from ..constants import DeleteRecursive


def deleteContentCb(sender, instance, **kwargs):
    from ..models import ContentReference
    references = ContentReference.objects.filter(
        target=instance
    )
    nogroup_references = references.filter(
        delete_recursive=DeleteRecursive.NO_GROUP
    )

    recursive_references = references.filter(
        delete_recursive=DeleteRecursive.TRUE
    )
    # delete recursive connected contents
    sender.objects.filter(
        references__in=recursive_references
    ).delete()

    # delete contents if group vanishes
    delete_ids = []
    for content_id in sender.objects.filter(
        models.Q(references__in=nogroup_references)
    ).values_list("pk", flat=True):
        if not ContentReference.objects.filter(
            ~models.Q(target=instance),
            id=content_id,
            group__in=nogroup_references.filter(
                target_id=content_id
            ).values_list("group", flat=True)
        ):
            delete_ids.append(content_id)
    sender.objects.filter(id__in=delete_ids).delete()


def deleteEncryptedFileCb(sender, instance, **kwargs):
    if instance.file:
        instance.file.delete(False)


def generateFlexid(sender, instance, force=False, **kwargs):
    from .models import Component, Content
    if not instance.flexid or force:
        for i in range(0, 1000):
            if i >= 999:
                raise ValueError(
                    'A possible infinite loop was detected'
                )
            instance.flexid = uuid.uuid4()
            try:
                with transaction.atomic():
                    instance.save(
                        update_fields=["flexid"]
                    )
                break
            except IntegrityError:
                pass

        if issubclass(sender, Content):
            fname = instance.file.name
            instance.file.save("", instance.file.open("r"))
            instance.file.storage.delete(fname)
            instance.info.filter(tag__startswith="id=").update(
                tag=f"id={instance.flexid}"
            )
        elif issubclass(sender, Component) and force:
            for c in instance.contents.all():
                generateFlexid(Content, c, True)


def fillEmptyFlexidsCb(sender, **kwargs):
    from .models import Component, Content
    for c in Component.objects.filter(flexid=None):
        generateFlexid(Component, c, False)
    for c in Content.objects.filter(flexid=None):
        generateFlexid(Content, c, False)
