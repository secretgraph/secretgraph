
import uuid

from django.db import transaction
from django.db.utils import IntegrityError


def deleteContentCb(sender, instance, **kwargs):
    sender.objects.filter(
        references__delete_recursive=True,
        references__target=instance
    ).delete()


def deleteContentValueCb(sender, instance, **kwargs):
    if instance.file:
        instance.file.delete(False)


def generateComponentFlexidCb(sender, instance, **kwargs):
    if not instance.flexid:
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


def fillEmptyFlexidsCb(sender, **kwargs):
    from .models import Component
    for c in Component.objects.filter(flexid=None):
        generateComponentFlexidCb(Component, c)
