from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from secretgraph.server.utils.auth import in_cached_net_properties_or_user_special

user_model = get_user_model()


# Define a new User admin
class UserAdmin(BaseUserAdmin):
    def has_module_permission(self, request, obj=None):
        return getattr(
            request.user, "is_staff", False
        ) or in_cached_net_properties_or_user_special(request, "manage_user")

    has_view_permission = has_module_permission

    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return in_cached_net_properties_or_user_special(request, "manage_user")

    has_add_permission = has_change_permission


# Re-register UserAdmin
try:
    admin.site.unregister(user_model)
except admin.sites.NotRegistered:
    pass
admin.site.register(user_model, UserAdmin)
