import re
import os
from itertools import chain
from django import forms
from django.utils.translation import gettext_lazy as _

from .fields import MultipleOpenChoiceField
from .widgets import ListWidget
from .models import Content
from .actions.update import create_content_fn
from . import messages
from ..utils.auth import initializeCachedResult


class PushForm(forms.Form):
    value = forms.FileField(required=True)
    nonce = forms.CharField(label=messages.nonce_label, required=False)
    tags = MultipleOpenChoiceField(
        label=messages.extra_tags_label, required=False,
        widget=ListWidget(
            items={
                "format_type": "text"
            },
            item_label=messages.tags_tag_label
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
        if ret.get("tags") is not None:
            allowed = form.get("allowedTags", None)
            if allowed is not None:
                matcher = re.compile(
                    "^(?:%s)(?:(?<==)|$)" % "|".join(map(
                        re.escape,
                        allowed
                    ))
                )
                ret["tags"] = filter(
                    lambda x: matcher.fullmatch(x),
                    ret["tags"]
                )
            ret["tags"] = chain(
                form.get("injectedTags", []),
                ret["tags"]
            )
        else:
            ret["tags"] = form.get("injectedTags") or []
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
                "tags": self.cleaned_data["tags"]
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
            create_content_fn(
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
    tags = MultipleOpenChoiceField(
        label=messages.extra_tags_label, required=False,
        widget=ListWidget(
            items={
                "format_type": "text"
            },
            item_label=messages.tags_tag_label
        )
    )
    references = MultipleOpenChoiceField(
        label=_("References contents"), required=False
    )

    def __init__(self, result, **kwargs):
        super().__init__(**kwargs)
        # TODO: find valid references


class PreKeyForm(forms.Form):
    password = forms.CharField(widget=forms.PasswordInput())
