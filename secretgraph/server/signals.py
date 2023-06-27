import logging
import uuid
from datetime import timedelta as td
from itertools import islice, product

from django.db import models, transaction
from django.db.utils import IntegrityError
from django.utils import timezone
from strawberry.relay import to_base64

from ..core.constants import DeleteRecursive

logger = logging.getLogger(__name__)


def _hashbuilder_helper(inp: str):
    return "key_hash={}".format(inp.removeprefix("Key:"))


def initializeDb(**kwargs):
    from django.conf import settings

    from .models import (
        Cluster,
        ClusterGroup,
        Content,
        ContentTag,
        Net,
        NetGroup,
        SGroupProperty,
    )

    # system net for injected keys cluster and as fallback
    net = Net.objects.update_or_create(
        id=0,
        defaults={
            "id": 0,
            "quota": None,
            "max_upload_size": None,
            "active": True,
            "user_name": "",
        },
    )[0]

    # system cluster for injected keys
    c = Cluster.objects.update_or_create(
        id=0,
        defaults={
            "id": 0,
            "name": "@system",
            "name_cached": to_base64("Cluster", "@system"),
            "net": net,
        },
    )[0]
    if c != net.primaryCluster:
        net.primaryCluster = c
        net.save(update_fields=["primaryCluster"])
    for name, group in settings.SECRETGRAPH_DEFAULT_CLUSTER_GROUPS.items():
        group = dict(group)
        properties = []
        for prop in set(filter(lambda x: x, group.pop("properties", []))):
            properties.append(
                SGroupProperty.objects.get_or_create(name=prop, defaults={})[0]
            )
        # not valid
        group.pop("clusters", None)
        injectedKeys = group.pop("injectedKeys", None)
        managed = group.pop("managed", False)
        created = not ClusterGroup.objects.filter(name=name).exists()
        instance = ClusterGroup(**group)
        instance.name = name
        instance.clean()
        ClusterGroup.objects.bulk_create(
            [instance],
            ignore_conflicts=not managed,
            update_conflicts=managed,
            update_fields=["description", "hidden"],
            unique_fields=["name"],
        )
        if created or managed:
            instance = ClusterGroup.objects.get(name=name)
            instance.properties.set(properties)
            if injectedKeys is not None:
                hashes = list(map(_hashbuilder_helper, injectedKeys))
                injectedKeys = Content.objects.filter(
                    models.Exists(
                        ContentTag.objects.filter(
                            content_id=models.OuterRef("id", tag__in=hashes)
                        )
                    ),
                    cluster__name="@system",
                    type="PublicKey",
                )
                instance.injectedKeys.set(injectedKeys)
    for name, group in settings.SECRETGRAPH_DEFAULT_NET_GROUPS.items():
        group = dict(group)
        properties = []
        for prop in set(filter(lambda x: x, group.pop("properties", []))):
            properties.append(
                SGroupProperty.objects.get_or_create(name=prop, defaults={})[0]
            )
        # not valid
        group.pop("nets", None)
        managed = group.pop("managed", False)
        created = not NetGroup.objects.filter(name=name).exists()
        instance = NetGroup(**group)
        instance.name = name
        instance.clean()
        NetGroup.objects.bulk_create(
            [instance],
            ignore_conflicts=not managed,
            update_conflicts=managed,
            update_fields=["description"],
            unique_fields=["name"],
        )
        if created or managed:
            instance = NetGroup.objects.get(name=name)
            instance.properties.set(properties)


def deleteSizePreCb(sender, instance, **kwargs):
    if getattr(instance, "id", None):
        instance._deletion_size_calc_cache = instance.size


def deleteSizeCommitCb(sender, instance, **kwargs):
    from .models import Net

    if instance.net_id and hasattr(instance, "_deletion_size_calc_cache"):
        # don't update last_used, as it is not an interaction
        # and can be triggered by everyone
        Net.objects.filter(id=instance.net_id).update(
            bytes_in_use=models.F("bytes_in_use")
            - instance._deletion_size_calc_cache
        )


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
                )
                .annotate(amount=models.Count("group", distinct=True))
                .values("amount")
            ),
            remaining_groups=models.Subquery(
                other_references.filter(
                    group__in=nogroup_groups,
                    source=models.OuterRef("pk"),
                )
                .annotate(amount=models.Count("group", distinct=True))
                .values("amount")
            ),
        )
        .filter(remaining_groups__lt=models.F("all_groups"))
        .values("pk")
    )
    sender.objects.filter(id__in=delete_ids).delete()


def deleteEncryptedFileCb(sender, instance, **kwargs):
    if instance.file:
        instance.file.delete(False)


def generateFlexid(sender, instance, force=False, **kwargs):
    from .models import Cluster, Content

    if force or not instance.flexid or not instance.flexid_cached:
        for i in range(0, 100):
            if i >= 99:
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

    if issubclass(sender, Content):
        if force or not instance.downloadId:
            for i in range(0, 100):
                if i >= 99:
                    raise ValueError("A possible infinite loop was detected")

                instance.downloadId = str(uuid.uuid4())
                try:
                    with transaction.atomic():
                        instance.save(
                            update_fields=[
                                "downloadId",
                            ]
                        )
                    break
                except IntegrityError:
                    pass


def regenerateKeyHash(force=False, **kwargs):
    from django.conf import settings

    from .models import Content, ContentTag
    from .utils.hashing import calculateHashes

    contents = Content.objects.filter(type="PublicKey")
    current_prefix = f"Key:{settings.SECRETGRAPH_HASH_ALGORITHMS[0]}:"
    # calculate for all old hashes
    if not force:
        contents = contents.exclude(contentHash__startswith=current_prefix)

    # distinct on contentHash field currently only for postgresql
    for content in contents:
        chashes = calculateHashes(content.load_pubkey())
        until_index = 0
        strippedContentHash = content.contentHash.removeprefix("Key:")
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
    from .models import Action, Content, ContentTag

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
            cas_trigger.filter(content_id=models.OuterRef("id"))
            .order_by("-action__used")
            .values("action__used")[:1],
        )
    ).filter(
        ~models.Exists(cas_disarm.filter(content_id=models.OuterRef("id"))),
        latest_used__isnull=False,  # no trigger
    ).update(
        markForDestruction=models.F("latest_used") + td(hours=24)
    )
    # update all non-destructing contents of clusters in destruction with
    # the markForDestruction of the cluster
    Content.objects.annotate(
        ClusterMarkForDestruction=models.Subquery(
            Cluster.objects.filter(id=models.OuterRef("cluster_id")).values(
                "markForDestruction"
            )
        )
    ).exclude(ClusterMarkForDestruction=None).update(
        markForDestruction=models.F("ClusterMarkForDestruction")
    )

    # cleanup expired Contents
    for c in Content.objects.filter(
        models.Q(markForDestruction__isnull=False)
        if ignoreTime
        else models.Q(markForDestruction__lte=now)
    ):
        c.delete()
    # cleanup expired Clusters afterward
    for c in Cluster.objects.annotate(models.Count("contents")).filter(
        models.Q(markForDestruction__isnull=False)
        if ignoreTime
        else models.Q(markForDestruction__lte=now),
        contents__count=0,
    ):
        try:
            c.delete()
        except models.RestrictedError:
            pass


async def notifyUpdateOrCreate(sender, instance, created, **kwargs):
    from .utils.misc import get_secretgraph_channel

    channel = get_secretgraph_channel()
    if channel:
        if created:
            await channel.send(
                "content_or_cluster.created",
                {
                    "relay_ids": [instance.flexid_cached],
                    "db_ids": [instance.id],
                    "type": sender.__name__,
                },
            )

        else:
            await channel.send(
                "content_or_cluster.update",
                {
                    "relay_ids": [instance.flexid_cached],
                    "db_ids": [instance.id],
                    "type": sender.__name__,
                },
            )


async def notifyDeletion(sender, instance, **kwargs):
    from .utils.misc import get_secretgraph_channel

    channel = get_secretgraph_channel()
    if channel:
        await channel.send(
            "content_or_cluster.deletion",
            {
                "relay_ids": [instance.flexid_cached],
                "db_ids": [instance.id],
                "type": sender.__name__,
            },
        )
