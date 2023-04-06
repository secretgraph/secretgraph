from django.contrib import admin
from django.db.models import Subquery

from secretgraph.server.utils.auth import (
    get_cached_properties,
    get_cached_result,
)

from .models import (
    Action,
    ContentAction,
    Cluster,
    Content,
    ContentTag,
    ContentReference,
    GlobalGroup,
    GlobalGroupProperty,
    Net,
)


class GlobalGroupInline(admin.TabularInline):
    list_display = ["name"]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if not get_cached_properties(request).isdisjoint(
            {"manage_hidden", "manage_groups"}
        ):
            return qs
        return qs.filter(globalgroup__hidden=False)


class GlobalGroupInlineOfGlobalGroupProperty(GlobalGroupInline):
    model = GlobalGroupProperty.groups.through


class GlobalGroupInlineOfCluster(GlobalGroupInline):
    model = Cluster.groups.through


class ContentTagInline(admin.TabularInline):
    model = ContentTag
    extra = 0

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        return False

    has_add_permission = has_change_permission
    has_delete_permission = has_change_permission


class ContentReferenceInline(admin.TabularInline):
    readonly_fields = ["target"]
    model = ContentReference
    fk_name = "source"
    extra = 0

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        return False

    has_add_permission = has_change_permission
    has_delete_permission = has_change_permission


class ContentActionInlineForContent(admin.TabularInline):
    model = ContentAction
    extra = 1

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request):
        if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True


class ContentActionInlineForCluster(admin.TabularInline):
    model = ContentAction
    extra = 1


class ActionInlineForCluster(admin.TabularInline):
    list_display = [repr]
    inlines = [ContentActionInlineForCluster]
    readonly_fields = ["value"]
    model = Action
    extra = 0

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True
        return False

    has_delete_permission = has_change_permission


class NetAdmin(admin.ModelAdmin):
    list_display = [repr]

    def has_module_permission(self, request, obj=None):
        return (
            getattr(request.user, "is_staff", False)
            or getattr(request.user, "is_superuser", False)
            or "manage_user" in get_cached_properties(request)
        )

    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return getattr(
            request.user, "is_superuser", False
        ) or "manage_user" not in get_cached_properties(request)

    has_add_permission = has_change_permission


class ClusterAdmin(admin.ModelAdmin):
    inlines = [ActionInlineForCluster, GlobalGroupInlineOfCluster]
    list_display = [repr]
    readonly_fields = []

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if not getattr(request.user, "is_superuser", False):
            qs = qs.filter(
                id__in=Subquery(
                    get_cached_result(request)["Cluster"]["objects"].values(
                        "id"
                    )
                )
            )
        return qs

    def get_readonly_fields(self, request, obj=None):
        rfields = list(self.readonly_fields)
        if not getattr(request.user, "is_superuser", False):
            if "manage_featured" not in get_cached_properties(request):
                rfields.append("featured")

        return rfields

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    def has_add_permission(self, request) -> bool:
        return False


class ContentAdmin(admin.ModelAdmin):
    inlines = [ContentTagInline]
    list_display = [repr]
    readonly_fields = ["net", "file"]

    def get_readonly_fields(self, request, obj=None):
        rfields = list(self.readonly_fields)
        if obj:
            rfields.append("type")
        if not getattr(request.user, "is_superuser", False):
            if "manage_hidden" not in get_cached_properties(request):
                rfields.append("hidden")

        return rfields

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if not getattr(request.user, "is_superuser", False):
            qs = qs.filter(
                id__in=Subquery(
                    get_cached_result(request)["Content"]["objects"].values(
                        "id"
                    )
                )
            )

            if "manage_hidden" not in get_cached_properties(request):
                qs = qs.filter(hidden=False)
        return qs

    def has_view_permission(self, request, obj=None) -> bool:
        if (
            obj
            and obj.hidden
            and "manage_hidden" in get_cached_properties(request)
        ):
            return False
        return True

    # can change some special attributes so manage_update is required
    def has_change_permission(self, request, obj=None):
        if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True
        return False

    def has_add_permission(self, request) -> bool:
        return False


class GlobalGroupAdmin(admin.ModelAdmin):
    list_display = ["name"]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if "manage_hidden" in get_cached_properties(request):
            return qs
        return qs.filter(hidden=False)

    def has_module_permission(self, request):
        return True

    def has_view_permission(self, request, obj=None) -> bool:
        if (
            obj
            and obj.hidden
            and get_cached_properties(request).isdisjoint(
                {"manage_hidden", "manage_groups"}
            )
        ):
            return False
        return True

    def has_change_permission(self, request, obj=None):
        return getattr(
            request.user, "is_superuser", False
        ) or "manage_groups" in get_cached_properties(request)

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


class GlobalGroupPropertyAdmin(admin.ModelAdmin):
    inlines = [GlobalGroupInlineOfGlobalGroupProperty]

    def has_module_permission(self, request):
        return True

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        return getattr(
            request.user, "is_superuser", False
        ) or "manage_groups" in get_cached_properties(request)

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


admin.site.register(Net, NetAdmin)
admin.site.register(Cluster, ClusterAdmin)
admin.site.register(Content, ContentAdmin)
admin.site.register(GlobalGroup, GlobalGroupAdmin)
admin.site.register(GlobalGroupProperty, GlobalGroupPropertyAdmin)
