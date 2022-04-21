from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


def default_quota_user_local():
    return getattr(settings, "SECRETGRAPH_USER_QUOTA_LOCAL", None)


def default_quota_user_remote():
    return getattr(settings, "SECRETGRAPH_USER_QUOTA_REMOTE", None)


class QuotaUserBase:
    # optional quota
    quota_local: int = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=default_quota_user_local,
        help_text=_("Quota in Bytes, null for no limit"),
    )
    quota_remote: int = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=default_quota_user_remote,
        help_text=_("Quota in Bytes, null for no limit"),
    )
