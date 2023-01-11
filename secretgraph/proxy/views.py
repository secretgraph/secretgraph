from django.http import JsonResponse
from django.views import View
from django.urls import reverse
from django.contrib.staticfiles.storage import staticfiles_storage
from manifest_loader.utils import manifest


class WebmanifestView(View):
    def get(self, *args, **kwargs):
        return JsonResponse(
            {
                "$schema": "https://json.schemastore.org/web-manifest-combined.json",  # noqa
                "name": "Secretgraph",
                "short_name": "Secretgraph",
                "background_color": "#fff",
                "theme_color": "blue",
                "description": "Secretgraph web client",
                "start_url": reverse("secretgraph_proxy:client"),
                "display": "standalone",
                "icons": [
                    {
                        "src": staticfiles_storage.url(
                            "secretgraph/favicon-192x192.png"
                        ),
                        "sizes": "192x192",
                        "type": "image/png",
                    },
                    {
                        "src": staticfiles_storage.url(
                            "secretgraph/favicon-512x512.png"
                        ),
                        "sizes": "512x512",
                        "type": "image/png",
                    },
                    {
                        "src": staticfiles_storage.url(
                            "secretgraph/favicon.svg"
                        ),
                        "sizes": "any",
                        "purpose": "any maskable",
                        "type": "image/svg+xml",
                    },
                ],
                "serviceworker": {
                    "src": manifest("serviceworker.js"),
                    "scope": "/",
                    "use_cache": True,
                },
            }
        )
