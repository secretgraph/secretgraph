from django.utils.translation import gettext_lazy as _


server_key_label = _("Key for decoding value")
tags_label = _("Metadata for content")
extra_tags_label = _("Extra metadata for content")
tags_tag_label = _("Metadata Tag")
reference_label = _("Reference")

net_limit_help = _("in bytes, null for no limit")
last_used_help = _(
    "Last usage of net for creating or updating contents or clusters"
)

cluster_groups_help = _(
    "cluster groups: groups for cluster permissions and injected keys"
)

net_groups_help = _("cluster groups: groups for permissions")
reference_group_help = _(
    "ContentReference group: references are clustered in groups. "
    "They are used to signal different functions of the connection"
)

contentaction_group_help = _(
    "ContentAction group: ContentActions are clustered in groups. "
    "They are used to signal different functions of the connection"
)
