from contextlib import nullcontext
from datetime import timedelta
from typing import Optional

from asgiref.sync import async_to_sync
from django.contrib import admin
from django.db import transaction
from django.db.models import F, QuerySet, Subquery
from django.utils import timezone
from strawberry import relay

from secretgraph.server.utils.auth import (
    get_cached_net_properties,
    get_cached_result,
    in_cached_net_properties_or_user_special,
)

from .models import (
    Action,
    Cluster,
    ClusterGroup,
    Content,
    ContentAction,
    ContentReference,
    ContentTag,
    Net,
    NetGroup,
    SGroupProperty,
)
from .signals import generateFlexidAndDownloadId, sweepOutdated


@admin.display(ordering="id", description="")
def admin_repr(inp):
    return repr(inp)


@admin.display(ordering="net_id", description="Net")
def net_repr(inp):
    return repr(inp.net)


class BeautifyNetMixin:
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        ret = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if db_field.name == "net":
            ret.label_from_instance = repr
        return ret

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        ret = super().formfield_for_manytomany(db_field, request, **kwargs)
        if db_field.name == "nets":
            ret.label_from_instance = repr
        return ret


class FlexidMixin:
    actions = ["reset_flexid", "undelete", "purge_immediate"]

    @admin.action(permissions=["change"], description="Reset Flexid of selected")
    def reset_flexid(self, request, queryset):
        for obj in queryset:
            generateFlexidAndDownloadId(type(obj), obj, True)

    @admin.action(permissions=["delete"], description="Undelete selected")
    def undelete(self, request, queryset):
        queryset.update(markForDestruction=None)
        if isinstance(queryset.model, Cluster):
            Content.objects.filter(cluster__in=Subquery(queryset)).update(
                markForDestruction=None
            )

    @admin.action(permissions=["delete"], description="Purge selected immediate")
    def purge_immediate(self, request, queryset):
        self.delete_queryset(request, queryset, 0)
        async_to_sync(sweepOutdated)()

    def delete_queryset(self, request, queryset, minutes=10):
        now = timezone.now() + timedelta(minutes=minutes)
        queryset.update(markForDestruction=now)
        if isinstance(queryset.model, Cluster):
            Content.objects.filter(cluster__in=Subquery(queryset)).update(
                markForDestruction=now
            )


class NetGroupInline(admin.TabularInline):
    extra = 1
    model = Net.groups.through

    def get_exclude(self, request, obj=None):
        if not in_cached_net_properties_or_user_special(
            request,
            "manage_net_groups",
            "allow_hidden_net_props",
            use_is_superuser=True,
            user_validate_origin=False,
        ):
            return []
        return ["properties"]

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        return in_cached_net_properties_or_user_special(
            request,
            "manage_net_groups",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


class ClusterGroupInline(admin.TabularInline):
    extra = 1

    def has_view_permission(self, request, obj=None) -> bool:
        # obj not ClusterGroup
        return True

    def has_change_permission(self, request, obj=None):
        # obj not ClusterGroup
        return in_cached_net_properties_or_user_special(
            request,
            "manage_cluster_groups",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


class ClusterGroupInlineOfSGroupProperty(ClusterGroupInline):
    model = SGroupProperty.clusterGroups.through


class NetGroupInlineOfSGroupProperty(NetGroupInline):
    model = SGroupProperty.netGroups.through


class ClusterGroupInlineOfCluster(ClusterGroupInline):
    model = Cluster.groups.through


class ContentTagInline(admin.TabularInline):
    model = ContentTag
    extra = 0

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        return in_cached_net_properties_or_user_special(
            request,
            "manage_update",
            use_is_superuser=True,
            user_validate_origin=False,
        )

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
        return in_cached_net_properties_or_user_special(
            request,
            "manage_update",
            use_is_superuser=True,
            user_validate_origin=False,
        )

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
        return in_cached_net_properties_or_user_special(
            request,
            "manage_update",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    has_delete_permission = has_change_permission


class ActionAdmin(admin.ModelAdmin):
    list_display = ["id", "keyHash", "cluster", "contentAction"]
    inlines = [ContentActionInline]
    readonly_fields = ["id", "nonce", "value"]
    search_fields = ["keyHash", "cluster__name"]
    sortable_by = ["id", "keyHash", "cluster"]

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_add_permission(self, request, obj=None):
        """if getattr(
            request.user, "is_superuser", False
        ) or "manage_update" in get_cached_net_properties(request, user_validate_origin=False):
            return True"""
        return False

    def has_change_permission(self, request, obj=None):
        return in_cached_net_properties_or_user_special(
            request,
            "manage_update",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    has_delete_permission = has_change_permission


class NetAdmin(admin.ModelAdmin):
    list_display = [admin_repr, "user_name"]
    readonly_fields = ["id", "bytes_in_use", "user"]
    search_fields = ["id", "user_name"]
    sortable_by = [admin_repr, "user_name"]
    inlines = [NetGroupInline]
    actions = ["recalculate_bytes_in_use"]

    @admin.action(
        permissions=["view", "change"], description="Recalculate bytes_in_use"
    )
    def recalculate_bytes_in_use(self, request, queryset: QuerySet[Net]):
        nullctx = nullcontext()
        with transaction.atomic():
            for net in queryset.select_for_update():
                net.recalculate_bytes_in_use(nullctx, nolocking=True)

    def get_readonly_fields(self, request, obj: Optional[Net] = None):
        rfields = list(self.readonly_fields)
        if obj and obj.primaryCluster and obj.primaryCluster.name == "@system":
            rfields.extend(
                [
                    "active",
                    "user_name",
                    "primaryCluster",
                    "max_upload_size",
                    "quota",
                ]
            )
        return rfields

    def has_module_permission(self, request, obj=None):
        return in_cached_net_properties_or_user_special(
            request,
            "manage_user",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    has_view_permission = has_module_permission

    def has_delete_permission(self, request, obj=None) -> bool:
        if in_cached_net_properties_or_user_special(
            request,
            "manage_user",
            use_is_superuser=True,
            user_validate_origin=False,
        ):
            return True
        return obj and obj.user_name == request.user.username

    def has_change_permission(self, request, obj=None) -> bool:
        return in_cached_net_properties_or_user_special(
            request,
            "manage_user",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    has_add_permission = has_change_permission


class ClusterAdmin(BeautifyNetMixin, FlexidMixin, admin.ModelAdmin):
    inlines = [ClusterGroupInlineOfCluster]
    list_display = ["id", "flexid", "name", "featured", net_repr]
    list_filter = ["featured"]
    sortable_by = ["id", "flexid", "name", "featured", net_repr]
    search_fields = ["flexid", "name", "id", "description"]
    readonly_fields = ["id", "flexid_cached", "name_cached"]

    def get_form(self, request, obj=None, change=False, **kwargs):
        form = super().get_form(request=request, obj=obj, change=change, **kwargs)

        def clean_name(self):
            name = self.cleaned_data["name"]
            if not getattr(request.user, "is_superuser", False):
                if name.startswith("@") and (not obj or obj.name != name):
                    if (
                        not in_cached_net_properties_or_user_special(
                            request,
                            "allow_global_name",
                            use_is_superuser=False,
                            user_validate_origin=False,
                        )
                        and not (
                            obj.properties
                            if obj
                            else SGroupProperty.objects.defaultClusterProperties()
                        )
                        .filter(name="allow_global_name")
                        .exists()
                    ):
                        name = f"+@{name}"
            return name

        form.clean_name = clean_name

        return form

    def get_queryset(self, request):
        async_to_sync(sweepOutdated)()
        qs = super().get_queryset(request)
        if not getattr(request.user, "is_superuser", False):
            net_properties = get_cached_net_properties(
                request, user_validate_origin=False
            )
            if net_properties.isdisjoint({"manage_update", "allow_view"}):
                qs = qs.filter(
                    id__in=Subquery(
                        get_cached_result(request)["Cluster"][
                            "objects_with_public"
                        ].values("id")
                    )
                )
            if "manage_deletion" not in net_properties:
                qs = qs.filter(markForDestruction=None)
        return qs

    def get_readonly_fields(self, request, obj=None):
        rfields = list(self.readonly_fields)
        if not getattr(request.user, "is_superuser", False):
            net_properties = get_cached_net_properties(
                request, user_validate_origin=False
            )
            if "allow_featured" not in net_properties and not (
                "allow_featured" in set(obj.properties.values_list("name", flat=True))
                if obj
                else SGroupProperty.objects.defaultClusterProperties()
                .filter("allow_featured")
                .exists()
            ):
                rfields.append("featured")
            if "manage_deletion" not in net_properties:
                rfields.append("markForDestruction")

        return rfields

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return in_cached_net_properties_or_user_special(
            request,
            "manage_update",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    def has_delete_permission(self, request, obj=None) -> bool:
        return in_cached_net_properties_or_user_special(
            request,
            "manage_deletion",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    def save_model(self, request, obj: Cluster, form, change):
        if change:
            old = Cluster.objects.all().filter(id=obj.id).first()
            if old.flexid != obj.flexid:
                obj.flexid_cached = relay.to_base64(obj.flexid)
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
                obj.flexid_cached = relay.to_base64(obj.flexid)

            obj.net.bytes_in_use += len(obj.description)
            with transaction.atomic():
                obj.net.save()
                obj.save()

    def delete_model(self, request, obj):
        now = timezone.now() + timedelta(minutes=10)
        obj.contents.update(markForDestruction=now)
        obj.markForDestruction = now
        obj.save()


class ContentAdmin(BeautifyNetMixin, FlexidMixin, admin.ModelAdmin):
    inlines = [ContentTagInline]
    list_display = [
        "id",
        "flexid",
        "type",
        "state",
        "cluster",
        "hidden",
        net_repr,
    ]
    list_filter = ["hidden", "state", "type"]
    sortable_by = ["flexid", "id", "type", "state", "cluster", net_repr]
    search_fields = ["flexid", "tags__tag", "cluster__name"]
    readonly_fields = ["flexid_cached", "file_accessed"]

    def get_queryset(self, request):
        async_to_sync(sweepOutdated)()
        qs = super().get_queryset(request)
        if not getattr(request.user, "is_superuser", False):
            net_properties = get_cached_net_properties(
                request, user_validate_origin=False
            )
            if net_properties.isdisjoint({"manage_update", "allow_view"}):
                qs = qs.filter(
                    id__in=Subquery(
                        get_cached_result(request)["Content"][
                            "objects_with_public"
                        ].values("id")
                    )
                )

            if "allow_hidden" not in net_properties(request):
                qs = qs.filter(hidden=False)

            if "manage_deletion" not in net_properties(request):
                qs = qs.filter(markForDestruction=None)
        return qs

    def get_readonly_fields(self, request, obj=None):
        rfields = list(self.readonly_fields)
        if obj:
            rfields.append("type")
        if not getattr(request.user, "is_superuser", False):
            net_properties = get_cached_net_properties(request)
            if "allow_hidden" in net_properties(request):
                rfields.append("hidden")
            if "manage_deletion" in net_properties(request):
                rfields.append("markForDestruction")

        return rfields

    def has_view_permission(self, request, obj=None) -> bool:
        if (
            obj
            and obj.hidden
            and not in_cached_net_properties_or_user_special(
                request,
                "allow_hidden",
                use_is_superuser=True,
                user_validate_origin=False,
            )
        ):
            return False
        return True

    # can change some special attributes so manage_update is required
    def has_change_permission(self, request, obj=None):
        return in_cached_net_properties_or_user_special(
            request,
            "manage_update",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    def has_add_permission(self, request) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return in_cached_net_properties_or_user_special(
            request,
            "manage_deletion",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    def save_model(self, request, obj, form, change):
        if change:
            old = Content.objects.all().filter(id=obj.id).first()
            if old.flexid != obj.flexid:
                obj.flexid_cached = relay.to_base64(obj.flexid)
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
                obj.flexid_cached = relay.to_base64(obj.flexid)
            obj.net.bytes_in_use = F("bytes_in_use") + obj.size
            with transaction.atomic():
                obj.net.save()
                obj.save()

    def delete_model(self, request, obj):
        now = timezone.now() + timedelta(minutes=10)
        obj.markForDestruction = now
        obj.save()


class ClusterGroupAdmin(admin.ModelAdmin):
    list_display = ["name"]
    sortable_by = ["name"]
    search_fields = ["name"]
    list_filter = ["properties"]

    def has_module_permission(self, request):
        return True

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        return in_cached_net_properties_or_user_special(
            request,
            "manage_cluster_groups",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


class NetGroupAdmin(BeautifyNetMixin, admin.ModelAdmin):
    list_display = ["name"]
    sortable_by = ["name"]
    search_fields = ["name", "nets__user_name"]

    def get_exclude(self, request, obj=None):
        if in_cached_net_properties_or_user_special(
            request,
            "manage_net_groups",
            "allow_hidden_net_props",
            use_is_superuser=True,
            user_validate_origin=False,
        ):
            return ["properties"]
        return []

    def has_module_permission(self, request):
        return True

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        return in_cached_net_properties_or_user_special(
            request,
            "manage_net_groups",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    def get_list_filter(self, request):
        if in_cached_net_properties_or_user_special(
            request,
            "manage_net_groups",
            "allow_hidden_net_props",
            use_is_superuser=True,
            user_validate_origin=False,
        ):
            return ["properties"]
        return []

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


class SGroupPropertyAdmin(admin.ModelAdmin):
    list_display = ["name"]
    sortable_by = ["name"]
    search_fields = ["name"]

    def get_exclude(self, request, obj=None):
        if in_cached_net_properties_or_user_special(
            request,
            "manage_net_groups",
            "allow_hidden_net_props",
            use_is_superuser=True,
            user_validate_origin=False,
        ):
            return ["properties"]
        return []

    def get_inlines(self, request, obj=None):
        if in_cached_net_properties_or_user_special(
            request,
            "manage_net_groups",
            "allow_hidden_net_props",
            use_is_superuser=True,
            user_validate_origin=False,
        ):
            return [
                ClusterGroupInlineOfSGroupProperty,
                NetGroupInlineOfSGroupProperty,
            ]
        return [
            ClusterGroupInlineOfSGroupProperty,
        ]

    def has_module_permission(self, request):
        return True

    def has_view_permission(self, request, obj=None) -> bool:
        return True

    def has_change_permission(self, request, obj=None):
        if obj and obj.name == "default":
            return False
        return in_cached_net_properties_or_user_special(
            request,
            "manage_cluster_groups",
            use_is_superuser=True,
            user_validate_origin=False,
        )

    has_delete_permission = has_change_permission
    has_add_permission = has_change_permission


admin.site.register(Net, NetAdmin)
admin.site.register(Cluster, ClusterAdmin)
admin.site.register(Content, ContentAdmin)
admin.site.register(Action, ActionAdmin)
admin.site.register(ClusterGroup, ClusterGroupAdmin)
admin.site.register(NetGroup, NetGroupAdmin)
admin.site.register(SGroupProperty, SGroupPropertyAdmin)
