import logging
from datetime import timedelta as td

from django.db.models import Q, QuerySet
from django.utils import timezone
from graphql_relay import from_global_id

from ..models import Cluster, Content, ContentAction
from ..utils.auth import retrieve_allowed_objects

logger = logging.getLogger(__name__)


def fetch_clusters(
    request, query=None,
    info_include=None, info_exclude=None
):
    flexid = None
    if query is None:
        query = Cluster.objects.all()
    elif isinstance(query, str):
        if ":" in query:
            type_name, query = from_global_id(query)
        flexid = query
        query = Cluster.objects.all()
    incl_filters = Q()
    for i in info_include or []:
        incl_filters |= Q(contents__info__tag__startswith=i)

    excl_filters = Q()
    for i in info_exclude or []:
        excl_filters |= Q(contents__info__tag__startswith=i)
    result = retrieve_allowed_objects(
        request, "view", query.filter(~excl_filters & incl_filters)
    )
    if flexid:
        result["objects"] = result["objects"].filter(flexid=flexid)
    return result


class ContentFetchQueryset(QuerySet):
    """
        Tracks usage of contents and mark accordingly Content for removal
    """
    only_direct_fetch_trigger = False

    def __init__(
        self,
        secretgraph_result=None,
        only_direct_fetch_action_trigger=False,
        **kwargs
    ):
        query = kwargs.get("query", None)
        result = secretgraph_result or query.secretgraph_result
        if result:
            self.secretgraph_result = result
            kwargs["query"] = query or result["objects"]
            kwargs["model"] = kwargs.get("model", None) or query.model
        self.only_direct_fetch_action_trigger = \
            only_direct_fetch_action_trigger
        super().__init__(**kwargs)

    def _clone(self):
        """
        Return a copy of the current QuerySet. A lightweight alternative
        to deepcopy().
        """
        c = super()._clone()
        c.secretgraph_result = self.secretgraph_result
        c.only_direct_fetch_action_trigger = \
            self.only_direct_fetch_action_trigger
        return c

    def fetch_action_trigger(self, objects, direct=True):
        """
            Trigger fetch handling stuff
            fetch=delete after read
        """
        assert self.secretgraph_result
        if self.only_direct_fetch_action_trigger and not direct:
            return objects
        if isinstance(objects, Content):
            used_actions = self.secretgraph_result["actions"].filter(
                content_action__content=objects
            ).select_related("content_action")
        else:
            used_actions = self.secretgraph_result["actions"].filter(
                content_action__content__in=objects
            ).select_related("content_action")
        cactions = ContentAction.objects.filter(action__in=used_actions)
        cactions.update(used=True)
        mark_for_destruction = timezone.now() + td(hours=8)
        contents = Content.objects.filter(
            actions__in=cactions.filter(group="fetch", used=True)
        ).exclude(actions__in=ContentAction.objects.filter(
            group="fetch", used=False
        ))
        contents.update(mark_for_destruction=mark_for_destruction)
        return objects

    def __iter__(self):
        for i in self.fetch_action_trigger(super().__iter__(), False):
            yield i

    def __len__(self):
        return self._originalqs.__len__()

    def __getitem__(self, key):
        return self.fetch_action_trigger(
            self._originalqs.__getitem__(key), False
        )

    def __getattr__(self, key):
        return getattr(self._originalqs, key)

    def get(self, *args, **kwargs):
        return self.fetch_action_trigger(
            self._originalqs.get(*args, **kwargs), False
        )

    def first(self):
        return self.fetch_action_trigger(self._originalqs.first(), False)


def fetch_contents(
    request, query=None, authset=None, info_include=None, info_exclude=None
) -> dict:
    flexid = None
    # cleanup expired
    Content.objects.filter(
        mark_for_destruction__lte=timezone.now()
    ).delete()
    if query is None:
        query = Content.objects.all()
    elif isinstance(query, str):
        if ":" in query:
            type_name, query = from_global_id(query)
            if type_name != "Content":
                raise ValueError("Only for contents")
        flexid = query
        query = Content.objects.all()
    incl_filters = Q()
    for i in info_include or []:
        incl_filters |= Q(info__tag__startswith=i)

    excl_filters = Q()
    for i in info_exclude or []:
        excl_filters |= Q(info__tag__startswith=i)
    result = retrieve_allowed_objects(
        request, "view", query.filter(~excl_filters & incl_filters),
        authset=authset
    )
    result["objects"] = result["objects"].filter(
        info__tag__in=map(
            lambda x: f"key_hash={x}", result["action_key_map"].keys()
        )
    )
    keys = result["objects"].filter(info__tag="private_key")
    if keys:
        result["objects"] = result["objects"].filter(
            info__tag__in=map(
                lambda x: f"key_hash={x}", result["content_key_map"].keys()
            )
        )
    result["objects"] = ContentFetchQueryset(result)
    if flexid:
        result["objects"] = result["objects"].filter(flexid=flexid)
        assert isinstance(result["objects"], ContentFetchQueryset)
        assert hasattr(result["objects"], "secretgraph_result")
    return result
