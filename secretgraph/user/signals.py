def syncNetAndUserActiveCb(sender, instance, raw, **kwargs):
    from ..server.models import Net

    if raw:
        return
    if isinstance(instance, Net):
        # if net is bound to user - system nets are not neccessary bound
        try:
            user = instance.user
        except Exception:
            user = None
        if user and instance.active != user.is_active:
            instance.user.is_active = instance.active
            instance.user.save(update_fields=["is_active"])
    else:
        if instance.is_active != instance.net.active:
            instance.net.active = instance.is_active
            instance.net.save(update_fields=["active"])
