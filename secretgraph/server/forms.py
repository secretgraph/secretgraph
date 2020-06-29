import re
import os
from itertools import chain
from django import forms
from django.utils.translation import gettext_lazy as _

from .fields import MultipleOpenChoiceField
from .widgets import ListWidget
from .models import Content
from .actions.view import create_content_func
from . import messages
from ..utils.auth import initializeCachedResult


class PushForm(forms.Form):
    value = forms.FileField(required=True)
    nonce = forms.CharField(label=messages.nonce_label, required=False)
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
        label=_("References contents"), required=False,
        widget=ListWidget(
            items=[
                {
                    "name": "group",
                    "format_type": "text"
                },
                {
                    "name": "target",
                    "format_type": "text",
                    "extras": {
                        "enum": []
                    }
                }
            ],
            item_label=messages.reference_label
        )
    )
    key = forms.CharField(label=messages.server_key_label, required=False)

    def __init__(self, result, instance, request, **kwargs):
        super().__init__(**kwargs)
        self.result = result
        self.instance = instance
        self.request = request

        if self.result["scope"] == "view":
            vresult = self.result
        else:
            vresult = initializeCachedResult(
                self.request, authset=self.result["authset"]
            )["Content"]

        self.fields["references"].items[1]["extras"]["enum"].extend(
            vresult["objects"].values_list("flexid")
        )

    def clean(self):
        ret = super().clean()
        form = self.result["forms"][self.instance.actions.get(group="push").id]
        if ret.get("info") is not None:
            allowed = form.get("allowedInfo", None)
            if allowed is not None:
                matcher = re.compile(
                    "^(?:%s)(?:(?<==)|$)" % "|".join(map(
                        re.escape,
                        allowed
                    ))
                )
                ret["info"] = filter(
                    lambda x: matcher.fullmatch(x),
                    ret["info"]
                )
            ret["info"] = chain(
                form.get("injectedInfo", []),
                ret["info"]
            )
        else:
            ret["info"] = form.get("injectedInfo") or []
        if ret.get("references") is not None:
            ret["references"] = chain(
                form.get("injectReferences", []),
                ret["references"]
            )
        else:
            ret["references"] = form.get("injectReferences") or []
        required_keys = list(
            Content.objects.injected_keys(
                group=self.instance.group
            ).values_list(
                "contentHash", flat=True
            )
        )
        required_keys.extend(form.get("requiredKeys", []))
        action_key = None
        content = {
            "content": {
                "nonce": self.cleaned_data.get("nonce"),
                "value": self.cleaned_data["value"],
                "info": self.cleaned_data["info"]
            },
            "key": self.cleaned_data.get("key")
        }
        action_key = None
        if form.pop("updateable", False):
            freeze = form.pop("freeze", False)
            action_key = os.urandom(32)
            content["actions"] = [{
                "key": action_key,
                "action": "update",
                "restrict": True,
                "freeze": freeze,
                "form": form
            }]
        self.save = lambda: (
            create_content_func(
                self.request, content,
                key=self.cleaned_data.get("key"),
                required_keys=required_keys
            ),
            action_key
        )
        return ret

    def save():
        raise ValueError()


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

    def __init__(self, result, **kwargs):
        super().__init__(**kwargs)
        # TODO: find valid references
