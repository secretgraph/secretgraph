import json

from django.conf import settings
from django.forms import widgets
from django.utils.translation import gettext_lazy as _


_extra = '' if settings.DEBUG else '.min'


class ListWidget(widgets.SelectMultiple):
    allow_multiple_selected = True

    class Media:
        js = [
            'node_modules/@json-editor/json-editor/dist/jsoneditor%s.js' % _extra,  # noqa:E501
            'secretgraph/ListEditorWidget.js'
        ]

    def __init__(
        self, *, attrs=None, items=None, item_label=_("Item"), **kwargs
    ):
        if attrs is None:
            attrs = {"class": "", "hidden": "hidden"}
        if items is None:
            items = {
                "format_type": "text",
                "json_type": "string"
            }
        attrs.setdefault("class", "")
        attrs["class"] += " ListEditorTarget"
        attrs.setdefault("hidden", "hidden")
        # don't eval items here as they are lazy evaluated for localization
        self.items = items
        # don't eval item_label as it is lazy evaluated for localization
        self.item_label = item_label
        super().__init__(attrs=attrs, **kwargs)

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        if isinstance(self.items, dict):
            context['widget']['attrs']["data-items"] = json.dumps(
                {
                    "title": str(self.item_label),
                    "type": self.items.get("json_type", "string"),
                    "format": self.items["format_type"],
                    "options": {
                        "inputAttributes": {
                            "form": "_dump_invalid_form",
                            "style": "width:100%"
                        },
                        **self.items.get("options", {})
                    }
                }
            )
        elif isinstance(self.items, list):
            context['widget']['attrs']["data-items"] = json.dumps(
                {
                    "title": str(self.item_label),
                    "type": "object",
                    "required": [
                        *map(
                            lambda x: x["name"],
                            filter(
                                lambda x: x.get("required"),
                                self.items
                            )
                        )
                    ],
                    "properties": dict(
                        (
                            x["name"],
                            {
                                "title": str(x["label"]),
                                "type": x.get("json_type", "string"),
                                "format": x["format_type"],
                                "options": {
                                    "inputAttributes": {
                                        "form": "_dump_invalid_form",
                                        "style": "width:100%"
                                    },
                                    **x.get("options", {})
                                }
                            }
                        ) for x in self.items
                    )
                }
            )
        return context

    def optgroups(self, name, value, attrs=None):
        """Return a list of optgroups for this widget."""
        groups = []

        for index, option_value in enumerate(value or []):
            if option_value is None:
                option_value = ''
            # selected = True
            groups.append((
                None,
                [self.create_option(
                    name, option_value, option_value, True, index,
                    subindex=None, attrs=attrs,
                )],
                index
            ))
        return groups
