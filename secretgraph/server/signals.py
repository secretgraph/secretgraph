from itertools import product, islice
import uuid

from django.db import transaction, models
from django.db.models.functions import Length
from django.db.utils import IntegrityError

from ..constants import DeleteRecursive


def initializeDb(sender, **kwargs):
    from .models import Cluster, GlobalGroupProperty
    from django.conf import settings

    Cluster.objects.update_or_create(
        id=1,
        defaults={
            "id": 1,
            "name": "system",
            "public": False,
            "featured": False,
        },
    )
    for group in list(getattr(settings, "SECRETGRAPH_DEFAULT_GROUPS", [])):
        group = dict(group)
        properties = []
        for prop in set(group.pop("properties")):
            properties.append(
                GlobalGroupProperty.objects.get_or_create(
                    name=prop, defaults={}
                )[0]
            )

        cluster, created = Cluster.objects.get_or_create(
            name=group.pop("name"), defaults=group
        )
        if created:
            cluster.properties.set(properties)


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
    if instance.file:
        instance.file.delete(False)


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


def regenerateKeyHash(sender, force=False, **kwargs):
    from .utils.misc import hash_object, calculate_hashes
    from .models import Content, ContentTag

    contents = Content.objects.filter(type="PublicKey")
    # calculate for all old hashes
    if not force:
        contents = contents.annotate(
            contentHash_length=Length("contentHash")
        ).exclude(contentHash_length=len(hash_object(b"")))

    # distinct on contentHash field currently only for postgresql
    for content in contents:
        chashes = calculate_hashes(content.load_pubkey())
        until_index = 0
        for i in chashes:
            if i == content.contentHash:
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
            contentHash__in=chashes[1:], type="PublicKey"
        ).update(contentHash=chashes[0])


def fillEmptyFlexidsCb(sender, **kwargs):
    from .models import Cluster, Content

    for c in Cluster.objects.filter(flexid=None):
        generateFlexid(Cluster, c, False)
    for c in Content.objects.filter(flexid=None):
        generateFlexid(Content, c, False)
