__all__ = ["SecretGraphUserConfig"]

from django.apps import AppConfig
from django.contrib.auth import get_user_model

from django.db.models.signals import post_save

from .signals import syncNetAndUserActiveCb


class SecretGraphUserConfig(AppConfig):
    name = "secretgraph.user"
    label = "secretgraph_user"
    verbose_name = "Secretgraph User"

    def ready(self):
        from django.conf import settings
        from ..server.models import Net

        if getattr(settings, "AUTH_USER_MODEL", None) or getattr(
            settings, "SECRETGRAPH_BIND_TO_USER", False
        ):
            usermodel = get_user_model()
            if hasattr(usermodel, "is_active"):
                post_save.connect(syncNetAndUserActiveCb, sender=usermodel)
                post_save.connect(syncNetAndUserActiveCb, sender=Net)
