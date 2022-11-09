import logging
from django.db import IntegrityError, transaction, models
from ..models import Content, ContentTag, ContentAction

logger = logging.getLogger(__name__)


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
                            action__used=True,
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
