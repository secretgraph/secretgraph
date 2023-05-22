from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model
from secretgraph.server.utils.auth import (
    get_cached_net_properties,
)

user_model = get_user_model()


# Define a new User admin
class UserAdmin(BaseUserAdmin):
    def has_module_permission(self, request, obj=None):
        return (
            getattr(request.user, "is_staff", False)
            or getattr(request.user, "is_superuser", False)
            or "manage_user" in get_cached_net_properties(request)
        )

    has_view_permission = has_module_permission

    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return getattr(
            request.user, "is_superuser", False
        ) or "manage_user" in get_cached_net_properties(request)

    has_add_permission = has_change_permission


# Re-register UserAdmin
try:
    admin.site.unregister(user_model)
except admin.sites.NotRegistered:
    pass
admin.site.register(user_model, UserAdmin)
