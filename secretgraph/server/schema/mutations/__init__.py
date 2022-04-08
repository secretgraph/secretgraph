import base64
import logging
import os
from datetime import timedelta as td
from itertools import chain

import strawberry
from strawberry_django_plus.relay import to_base64, GlobalID, input_mutation
from django.conf import settings
from django.db import transaction
from django.db.models import Q, Subquery
from django.utils import timezone

from ....constants import MetadataOperations, TransferResult
from ...actions.update import (
    create_cluster_fn,
    create_content_fn,
    transfer_value,
    update_cluster_fn,
    update_content_fn,
    update_metadata_fn,
    manage_actions_fn,
)
from ...models import Cluster, Content, GlobalGroupProperty, GlobalGroup
from ...signals import generateFlexid
from ...utils.auth import (
    fetch_by_id,
    ids_to_results,
    initializeCachedResult,
    retrieve_allowed_objects,
    check_permission,
)
from ..arguments import (
    AuthList,
    ActionInput,
    ClusterInput,
    ContentInput,
    PushContentInput,
    ReferenceInput,
)
from ...utils.arguments import pre_clean_content_spec
from ..definitions import ClusterNode, ContentNode

logger = logging.getLogger(__name__)
