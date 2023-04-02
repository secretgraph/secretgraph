from django.contrib import admin
from .models import (
    Net,
    Cluster,
    Content,
    ContentTag,
    GlobalGroup,
    GlobalGroupProperty,
)


class NetAdmin(admin.ModelAdmin):
    list_display = [repr]
    readonly_fields = ["bytes_in_use"]


class ClusterAdmin(admin.ModelAdmin):
    list_display = [repr]
    readonly_fields = []


class ContentTagInline(admin.TabularInline):
    model = ContentTag


class ContentAdmin(admin.ModelAdmin):
    inlines = [ContentTagInline]
    list_display = [repr]


class GlobalGroupAdmin(admin.ModelAdmin):
    list_display = ("name",)


admin.site.register(Net, NetAdmin)
admin.site.register(Cluster, ClusterAdmin)
admin.site.register(Content, ContentAdmin)
admin.site.register(GlobalGroup, GlobalGroupAdmin)
admin.site.register(GlobalGroupProperty)
