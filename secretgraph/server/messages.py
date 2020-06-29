from django.utils.translation import gettext_lazy as _


server_key_label = _("Key for decoding value")
info_label = _('Metadata for content')
extra_info_label = _("Extra metadata for content")
info_tag_label = _("Metadata Tag")
nonce_label = _("Nonce")
reference_label = _("Reference")


injection_group_help = _(
    "injection group: group which injected keys must be used for mutations "
    "with content/cluster"
)

reference_group_help = _(
    "ContentReference group: references are clustered in groups. "
    "They are used to signal different functions of the connection"
)

contentaction_group_help = _(
    "ContentAction group: ContentActions are clustered in groups. "
    "They are used to signal different functions of the connection"
)
