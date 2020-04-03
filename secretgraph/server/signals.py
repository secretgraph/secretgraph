
import uuid

from django.db import transaction
from django.db.utils import IntegrityError


def deleteContentCb(sender, instance, **kwargs):
    sender.objects.filter(
        references__delete_recursive=True,
        references__target=instance
    ).delete()


def deleteEncryptedFileCb(sender, instance, **kwargs):
    if instance.file:
        instance.file.delete(False)


def generateFlexid(sender, instance, force=False, **kwargs):
    from .models import Component, Content, ContentValue
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
        if isinstance(sender, Component) and force:
            for c in instance.contents.prefetch("values").all():
                generateFlexid(Content, c, True)
        if isinstance(sender, Content) and force:
            for c in instance.values.all():
                generateFlexid(ContentValue, c, True)


def fillEmptyFlexidsCb(sender, **kwargs):
    from .models import Component, Content, ContentValue
    for c in Component.objects.filter(flexid=None):
        generateFlexid(Component, c, False)
    for c in Content.objects.filter(flexid=None):
        generateFlexid(Content, c, False)
    for c in ContentValue.objects.filter(flexid=None):
        generateFlexid(ContentValue, c, False)
