from itertools import product, islice
import uuid
import logging
from datetime import timedelta as td
from strawberry_django_plus.relay import to_base64
from django.db import transaction, models
from django.db.utils import IntegrityError
from django.utils import timezone


from ..core.constants import DeleteRecursive

logger = logging.getLogger(__name__)


def initializeDb(**kwargs):
    from .models import Net, Cluster, GlobalGroupProperty, GlobalGroup
    from django.conf import settings

    # system net for injected keys cluster and as fallback
    net = Net.objects.update_or_create(
        id=0,
        defaults={"id": 0, "quota": None, "max_upload_size": None},
    )[0]

    # system cluster for injected keys
    Cluster.objects.update_or_create(
        id=0,
        defaults={
            "id": 0,
            "name": "@system",
            "name_cached": to_base64("Cluster", "@system"),
            "net": net,
        },
    )
    for name, group in settings.SECRETGRAPH_DEFAULT_GROUPS.items():
        group = dict(group)
        properties = []
        for prop in set(filter(lambda x: x, group.pop("properties", []))):
            properties.append(
                GlobalGroupProperty.objects.get_or_create(
                    name=prop, defaults={}
                )[0]
            )
        # not valid
        group.pop("clusters", None)
        injectedKeys = group.pop("injectedKeys", None)
        managed = group.pop("managed", False)
        created = not GlobalGroup.objects.filter(name=name).exists()
        instance = GlobalGroup(**group)
        instance.name = name
        instance.clean()
        GlobalGroup.objects.bulk_create(
            [instance],
            ignore_conflicts=not managed,
            update_conflicts=managed,
            update_fields=["description", "hidden", "matchUserGroup"],
            unique_fields=["name"],
        )
        if created or managed:
            instance = GlobalGroup.objects.get(name=name)
            instance.properties.set(properties)
            if injectedKeys is not None:
                # TODO: resolve hashes
                instance.injectedKeys.set(injectedKeys)


def deleteContentCb(sender, instance, **kwargs):
    from .models import ContentReference

    references = ContentReference.objects.filter(target=instance)
    other_references = ContentReference.objects.filter(
        ~models.Q(target=instance)
    )
    nogroup_references = references.filter(
        deleteRecursive=DeleteRecursive.NO_GROUP.value,
    )

    recursive_references = references.filter(
        deleteRecursive=DeleteRecursive.TRUE.value
    )
    # delete recursive connected contents
    sender.objects.filter(references__in=recursive_references).delete()

    nogroup_groups = set(nogroup_references.values_list("group", flat=True))

    # delete contents if group vanishes and NO_GROUP is set
    delete_ids = models.Subquery(
        sender.objects.filter(models.Q(references__in=nogroup_references))
        .annotate(
            all_groups=models.Subquery(
                ContentReference.objects.filter(
                    group__in=nogroup_groups,
                    source=models.OuterRef("pk"),
                ).annotate(amount=models.Count("group", distinct=True))
            ),
            remaining_groups=models.Subquery(
                other_references.filter(
                    group__in=nogroup_groups,
                    source=models.OuterRef("pk"),
                ).annotate(amount=models.Count("group", distinct=True))
            ),
        )
        .filter(remaining_groups__lt=models.F("all_groups"))
        .values("pk")
    )
    sender.objects.filter(id__in=delete_ids).delete()


def deleteEncryptedFileCb(sender, instance, **kwargs):
    from .models import Net

    file_size = 0
    try:
        file_size = instance.file.size
    except Exception as exc:
        logger.warning("Could not determinate file size", exc_info=exc)
    if instance.file:
        instance.file.delete(False)
    if instance.net_id:
        # don't update last_used, as it is not an interaction
        # and can be triggered by everyone
        Net.objects.filter(id=instance.net_id).update(
            bytes_in_use=models.F("bytes_in_use") - file_size
        )


def generateFlexid(sender, instance, force=False, **kwargs):
    from strawberry_django_plus.relay import to_base64
    from .models import Cluster, Content

    if not instance.flexid or not instance.flexid_cached or force:
        for i in range(0, 1000):
            if i >= 999:
                raise ValueError("A possible infinite loop was detected")
            instance.flexid = str(uuid.uuid4())
            instance.flexid_cached = to_base64(
                sender.__name__, instance.flexid
            )
            try:
                with transaction.atomic():
                    instance.save(update_fields=["flexid", "flexid_cached"])
                break
            except IntegrityError:
                pass

        # if issubclass(sender, Content):
        #    fname = instance.file.name
        #    instance.file.save("ignored", instance.file.open("rb"))
        #    instance.file.storage.delete(fname)
        #    instance.tags.filter(tag__startswith="id=").update(
        #        tag=f"id={instance.flexid}"
        #    )
        # el
        if issubclass(sender, Cluster) and force:
            for c in instance.contents.all():
                generateFlexid(Content, c, True)


def regenerateKeyHash(force=False, **kwargs):
    from .utils.hashing import calculateHashes
    from .models import Content, ContentTag
    from django.conf import settings

    contents = Content.objects.filter(type="PublicKey")
    current_prefix = f"Key:{settings.SECRETGRAPH_HASH_ALGORITHMS[0]}:"
    # calculate for all old hashes
    if not force:
        contents = contents.exclude(contentHash__startswith=current_prefix)

    # distinct on contentHash field currently only for postgresql
    for content in contents:
        chashes = calculateHashes(content.load_pubkey())
        until_index = 0
        strippedContentHash = content.contentHash.removePrefix("Key:")
        for i in chashes:
            if i == strippedContentHash:
                break
            until_index += 1
        assert (
            until_index > 0
        ), "should be higher than 0 as only non-matching are selected"
        # is already new
        if until_index == 0:
            continue

        #
        tags = list(map(lambda x: "key_hash=%s" % x, chashes))
        batch_size = 1000
        # exclude Contents with current key_hash
        contents_to_update = Content.objects.exclude(tags__tag=tags[0]).filter(
            models.Q(tags__tag__in=tags[until_index:])
        )
        while True:
            batch = [
                ContentTag(tag=tag, content=c)
                for (tag, c) in product(
                    tags[:until_index], islice(contents_to_update, batch_size)
                )
            ]
            if not batch:
                break
            # ignore duplicate key_hash entries
            ContentTag.objects.bulk_create(batch, ignore_conflicts=True)
        Content.objects.filter(
            contentHash__in=map(lambda x: f"Key:{x}", chashes[1:]),
            type="PublicKey",
        ).update(contentHash=f"Key:{chashes[0]}")


def fillEmptyFlexidsCb(**kwargs):
    from .models import Cluster, Content

    for c in Cluster.objects.filter(flexid=None):
        generateFlexid(Cluster, c, False)
    for c in Content.objects.filter(flexid=None):
        generateFlexid(Content, c, False)


def rollbackUsedActionsAndFreeze(request, **kwargs):
    from .models import Action, ContentTag, Content

    if getattr(request, "secretgraphActionsToRollback", None):
        Action.objects.filter(
            id__in=request.secretgraphActionsToRollback
        ).update(used=None)
    if getattr(request, "secretgraphFreezeToRollback", None):
        for i in range(0, 1000):
            if i >= 999:
                logger.error(
                    "A possible infinite loop was detected, don't unfreeze"
                )
            try:
                with transaction.atomic():
                    contents = Content.objects.filter(
                        id__in=request.secretgraphFreezeToRollback
                    ).select_for_update()
                    ContentTag.objects.filter(
                        tag="freeze", content__in=contents
                    ).delete()
                    ContentTag.objects.filter(
                        tag="immutable", content__in=contents
                    ).update(tag="freeze")
                break
            except IntegrityError:
                pass


def sweepContentsAndClusters(ignoreTime=False, **kwargs):
    from .models import Cluster, Content, ContentAction

    now = timezone.now()
    cas = ContentAction.objects.filter(group="fetch")
    cas_trigger = cas.filter(action__used__isnull=False)
    cas_disarm = cas.filter(action__used__isnull=True)
    Content.objects.annotate(
        latest_used=models.Subquery(
            cas_trigger.order("-used").values("used")[:1],
            content_id=models.OuterRef("id"),
        )
    ).filter(
        ~models.Exists(cas_disarm),
        latest_used__isnull=False,  # no trigger
        content_id=models.OuterRef("id"),
    ).update(
        markForDestruction=models.F("latest_used") + td(hours=24)
    )

    # cleanup expired Contents
    for c in Content.objects.filter(
        models.Q(markForDestruction__isnull=False)
        if ignoreTime
        else models.Q(markForDestruction__lte=now)
    ):
        c.delete()
    # cleanup expired Clusters afterward
    Cluster.objects.annotate(models.Count("contents")).filter(
        models.Q(markForDestruction__isnull=False)
        if ignoreTime
        else models.Q(markForDestruction__lte=now),
        contents__count=0,
    ).delete()
