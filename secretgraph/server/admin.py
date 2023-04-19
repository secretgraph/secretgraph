from datetime import timedelta
from contextlib import nullcontext

from strawberry_django_plus.relay import to_base64
from django.contrib import admin
from django.db.models import Subquery, F, QuerySet
from django.db import transaction
from django.utils import timezone

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
from .signals import sweepContentsAndClusters, fillEmptyFlexidsCb


@admin.display(description="")
def admin_repr(inp):
    return repr(inp)


class FlexidMixin:
    actions = ["reset_flexid", "undelete", "purge_immediate"]

    @admin.action(
        permissions=["change"], description="Reset Flexid of selected"
    )
    def reset_flexid(self, request, queryset):
        queryset.update(flexid=None, flexid_cached=None)
        fillEmptyFlexidsCb()

    @admin.action(permissions=["delete"], description="Undelete selected")
    def undelete(self, request, queryset):
        queryset.update(markForDestruction=None)
        if isinstance(queryset.model, Cluster):
            Content.objects.filter(cluster__in=Subquery(queryset)).update(
                markForDestruction=None
            )

    @admin.action(
        permissions=["delete"], description="Purge selected immediate"
    )
    def purge_immediate(self, request, queryset):
        self.delete_queryset(request, queryset, 0)
        sweepContentsAndClusters()

    def delete_queryset(self, request, queryset, minutes=10):
        now = timezone.now() + timedelta(minutes=minutes)
        queryset.update(markForDestruction=now)
        if isinstance(queryset.model, Cluster):
            Content.objects.filter(cluster__in=Subquery(queryset)).update(
                markForDestruction=now
            )


class GlobalGroupInline(admin.TabularInline):
    extra = 1

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if not get_cached_properties(request).isdisjoint(
            {"manage_hidden", "manage_groups"}
        ):
            return qs
        return qs.filter(globalgroup__hidden=False)

    def has_view_permission(self, request, obj=None) -> bool:
        # obj not GlobalGroup
        return True

    def has_change_permission(self, request, obj=None):
        # obj not GlobalGroup
        return getattr(
            request.user, "is_superuser", False
        ) or "manage_groups" in get_cached_properties(request)

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


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
        if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True
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
        if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True
        return False

    has_add_permission = has_change_permission
    has_delete_permission = has_change_permission


class ContentActionInline(admin.TabularInline):
    model = ContentAction
    extra = 1

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True
        return False

    has_delete_permission = has_change_permission


class ActionAdmin(admin.ModelAdmin):
    list_display = ["id", "keyHash", "cluster"]
    inlines = [ContentActionInline]
    readonly_fields = ["id", "nonce", "value"]
    search_fields = ["keyHash", "cluster__name"]
    sortable_by = ["id", "keyHash", "cluster"]

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_add_permission(self, request, obj=None):
        """if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True"""
        return False

    def has_change_permission(self, request, obj=None):
        if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True
        return False

    has_delete_permission = has_change_permission


class NetAdmin(admin.ModelAdmin):
    list_display = [admin_repr]
    search_fields = ["id", "user_name"]

    @admin.action(
        permissions=["view", "change"], description="Recalculate bytes_in_use"
    )
    def recalculate_bytes_in_use(self, request, queryset: QuerySet[Net]):
        nullctx = nullcontext()
        with transaction.atomic():
            for net in queryset.select_for_update():
                net.recalculate_bytes_in_use(nullctx)

    def has_module_permission(self, request, obj=None):
        return (
            getattr(request.user, "is_staff", False)
            or getattr(request.user, "is_superuser", False)
            or "manage_user" in get_cached_properties(request)
        )

    has_view_permission = has_module_permission

    def has_delete_permission(self, request, obj=None) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return getattr(
            request.user, "is_superuser", False
        ) or "manage_user" not in get_cached_properties(request)

    has_add_permission = has_change_permission


class ClusterAdmin(FlexidMixin, admin.ModelAdmin):
    inlines = [GlobalGroupInlineOfCluster]
    list_display = ["id", "flexid", "name", "net"]
    sortable_by = ["id", "flexid", "name", "net"]
    search_fields = ["flexid", "name", "description"]
    readonly_fields = ["flexid_cached", "name_cached"]

    def get_queryset(self, request):
        sweepContentsAndClusters()
        qs = super().get_queryset(request)
        if not getattr(request.user, "is_superuser", False):
            qs = qs.filter(
                id__in=Subquery(
                    get_cached_result(request)["Cluster"]["objects"].values(
                        "id"
                    )
                )
            )
            if "manage_deletion" not in get_cached_properties(request):
                qs = qs.filter(markForDestruction=False)
        return qs

    def get_readonly_fields(self, request, obj=None):
        rfields = list(self.readonly_fields)
        if not getattr(request.user, "is_superuser", False):
            if "manage_featured" not in get_cached_properties(request):
                rfields.append("featured")
            if "manage_deletion" not in get_cached_properties(request):
                rfields.append("markForDestruction")

        return rfields

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_properties(request):
            return True
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return bool(
            getattr(request.user, "is_superuser", False)
            or "manage_deletion" not in get_cached_properties(request)
        )

    def save_model(self, request, obj: Cluster, form, change):
        if change:
            old = Cluster.objects.all().filter(id=obj.id).first()
            if old.flexid != obj.flexid:
                obj.flexid_cached = to_base64(obj.flexid)
            if old.size != obj.size or old.net != obj.net:
                old.net.bytes_in_use = F("bytes_in_use") - old.size
                obj.net.bytes_in_use = F("bytes_in_use") + obj.size
                with transaction.atomic():
                    if old.net != obj.net:
                        old.net.save()
                    obj.net.save()
                    obj.save()
            else:
                obj.save()
        else:
            if obj.flexid:
                obj.flexid_cached = to_base64(obj.flexid)

            obj.net.bytes_in_use += len(obj.description)
            with transaction.atomic():
                obj.net.save()
                obj.save()

    def delete_model(self, request, obj):
        now = timezone.now() + timedelta(minutes=10)
        obj.contents.update(markForDestruction=now)
        obj.markForDestruction = now
        obj.save()


class ContentAdmin(FlexidMixin, admin.ModelAdmin):
    inlines = [ContentTagInline]
    list_display = [
        "id",
        "flexid",
        "type",
        "state",
        "cluster",
        "net",
        admin_repr,
    ]
    sortable_by = ["id", "flexid", "type", "state", "cluster", "net"]
    search_fields = ["flexid", "tags__tag", "cluster__name"]
    readonly_fields = ["flexid_cached"]

    def get_queryset(self, request):
        sweepContentsAndClusters()
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

            if "manage_deletion" not in get_cached_properties(request):
                qs = qs.filter(markForDestruction=False)
        return qs

    def get_readonly_fields(self, request, obj=None):
        rfields = list(self.readonly_fields)
        if obj:
            rfields.append("type")
        if not getattr(request.user, "is_superuser", False):
            if "manage_hidden" not in get_cached_properties(request):
                rfields.append("hidden")
            if "manage_deletion" not in get_cached_properties(request):
                rfields.append("markForDestruction")

        return rfields

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

    def has_delete_permission(self, request, obj=None) -> bool:
        return bool(
            getattr(request.user, "is_superuser", False)
            or "manage_deletion" not in get_cached_properties(request)
        )

    def save_model(self, request, obj, form, change):
        if change:
            old = Content.objects.all().filter(id=obj.id).first()
            if old.flexid != obj.flexid:
                obj.flexid_cached = to_base64(obj.flexid)
            old_size = old.size
            new_size = obj.size
            if old.net != obj.net or old_size != new_size:
                old.net.bytes_in_use = F("bytes_in_use") - old_size
                obj.net.bytes_in_use = F("bytes_in_use") + old_size
                with transaction.atomic():
                    if old.net != obj.net:
                        old.net.save()
                    obj.net.save()
                    obj.save()
            else:
                obj.save()

        else:
            if obj.flexid:
                obj.flexid_cached = to_base64(obj.flexid)
            obj.net.bytes_in_use = F("bytes_in_use") + obj.size
            with transaction.atomic():
                obj.net.save()
                obj.save()

    def delete_model(self, request, obj):
        now = timezone.now() + timedelta(minutes=10)
        obj.markForDestruction = now
        obj.save()


class GlobalGroupAdmin(admin.ModelAdmin):
    list_display = ["name"]
    sortable_by = ["name"]
    search_fields = ["name"]

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
    list_display = ["name"]
    sortable_by = ["name"]
    search_fields = ["name"]
    inlines = [GlobalGroupInlineOfGlobalGroupProperty]

    def has_module_permission(self, request):
        return True

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        if obj and obj.name == "default":
            return False
        return getattr(
            request.user, "is_superuser", False
        ) or "manage_groups" in get_cached_properties(request)

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


admin.site.register(Net, NetAdmin)
admin.site.register(Cluster, ClusterAdmin)
admin.site.register(Content, ContentAdmin)
admin.site.register(Action, ActionAdmin)
admin.site.register(GlobalGroup, GlobalGroupAdmin)
admin.site.register(GlobalGroupProperty, GlobalGroupPropertyAdmin)
