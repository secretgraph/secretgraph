from django import forms
from django.utils.translation import gettext_lazy as _

from .fields import MultipleOpenChoiceField
from .widgets import ListWidget
from . import messages


class PushForm(forms.Form):
    value = forms.FileField(required=True)
    info = MultipleOpenChoiceField(
        label=messages.extra_info_label, required=False,
        widget=ListWidget(
            items={
                "format_type": "text"
            },
            item_label=messages.info_tag_label
        )
    )
    references = MultipleOpenChoiceField(
        label=_("References contents"), required=False
    )
    key = forms.CharField(label=messages.server_key_label, required=False)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # TODO: find valid references


class UpdateForm(forms.Form):
    value = forms.FileField(required=True)
    info = MultipleOpenChoiceField(
        label=messages.extra_info_label, required=False,
        widget=ListWidget(
            items={
                "format_type": "text"
            },
            item_label=messages.info_tag_label
        )
    )
    references = MultipleOpenChoiceField(
        label=_("References contents"), required=False
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # TODO: find valid references
