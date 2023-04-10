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
        if (
            user
            and not isinstance(user, str)
            and instance.active != user.is_active
        ):
            user.is_active = instance.active
            user.save(update_fields=["is_active"])
    else:
        net = None
        try:
            net = Net.objects.filter(user_name=instance.get_username()).first()
        except AttributeError:
            pass
        if net:
            if instance.is_active != net.active:
                net.active = instance.is_active
                net.save(update_fields=["active"])
