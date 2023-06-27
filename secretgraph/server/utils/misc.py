from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.conf import settings
from django.db.transaction import Atomic

if TYPE_CHECKING:
    from channels.layers import InMemoryChannelLayer


class AsyncAtomic(Atomic):
    __aenter__ = sync_to_async(Atomic.__enter__, thread_sensitive=True)
    __aexit__ = sync_to_async(Atomic.__exit__, thread_sensitive=True)


def refresh_fields(inp, *fields):
    for i in inp:
        for field in fields:
            setattr(i, field, getattr(i, field))
        yield i


def get_secretgraph_channel() -> Optional[InMemoryChannelLayer]:
    return get_channel_layer(settings.SECRETGRAPH_CHANNEL_NAME)
