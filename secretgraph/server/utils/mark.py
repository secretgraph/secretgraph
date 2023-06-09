import logging

from django.db import IntegrityError, models, transaction
from django.db.models.functions import Now

from ..models import Content, ContentAction, ContentTag

logger = logging.getLogger(__name__)


def update_file_accessed(content_ids):
    # Now is faster and more accurate
    if isinstance(content_ids, int):
        Content.objects.filter(id=content_ids).update(file_accessed=Now())
    else:
        Content.objects.filter(id__in=content_ids).update(file_accessed=Now())


def freeze_contents(content_ids, request=None, update=False):
    for i in range(0, 1000):
        if i >= 999:
            logger.warning(
                "A possible infinite loop was detected, don't freeze"
            )
        try:
            updated_ids = set()
            with transaction.atomic():
                contents = Content.objects.filter(id__in=content_ids)
                ContentTag.objects.filter(
                    tag="freeze",
                    content_id__in=models.Subquery(
                        ContentTag.objects.filter(
                            tag="immutable", content__in=contents
                        ).values("content_id")
                    ),
                ).delete()
                ContentTag.objects.filter(
                    tag="freeze",
                    content_id__in=models.Subquery(
                        ContentAction.objects.filter(
                            group__in=["fetch", "view"],
                            action__used__isnull=False,
                            content__in=contents,
                        ).values("content_id")
                    ),
                ).update(tag="immutable")
                updated_ids = set(contents.values_list("id", flat=True))
            if request:
                if update:
                    updated_ids.update(
                        getattr(request, "secretgraphFreezeToRollback", None)
                        or []
                    )
                setattr(request, "secretgraphFreezeToRollback", updated_ids)
            break
        except IntegrityError:
            pass
