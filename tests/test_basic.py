import os
import json
import base64
from django.test import TestCase, RequestFactory

from strawberry.django.context import StrawberryDjangoContext


from secretgraph.schema import schema

createMutation = """
        mutation clusterCreateMutation(
        $name: String
        $description: String
        $featured: Boolean
        $primary: Boolean
        $actions: [ActionInput!]
        $authorization: [String!]
    ) {
        secretgraph {
            updateOrCreateCluster(
                input: {
                    cluster: {
                        name: $name
                        description: $description
                        actions: $actions
                        featured: $featured
                        primary: $primary
                    }
                    authorization: $authorization
                }
            ) {
                cluster {
                    id
                    groups
                    name
                    description
                    public
                    featured
                    primary
                    updateId
                    availableActions {
                        keyHash
                        type
                        allowedTags
                    }
                    contents(
                        filters: {
                            states: ["trusted", "required", "public"]
                            deleted: FALSE
                            includeTypes: ["PublicKey"]
                        }
                    ) {
                        edges {
                            node {
                                id
                                link
                            }
                        }
                    }
                }
                writeok
            }
        }
    }
"""


class BasicTests(TestCase):
    def setUp(self):
        # Every test needs access to the request factory.
        self.factory = RequestFactory()

    async def test_register_cluster(self):
        manage_key = os.urandom(50)
        view_key = os.urandom(50)
        request = self.factory.get("/graphql")

        result = await schema.execute(
            createMutation,
            {
                "name": "test",
                "description": "test description",
                "featured": True,
                "primary": True,
                "actions": [
                    {
                        "value": '{"action": "manage"}',
                        "key": base64.b64encode(manage_key).decode(),
                    },
                    {
                        "value": json.dumps(
                            {
                                "action": "view",
                                "includeTypes": [
                                    "PublicKey",
                                    "PrivateKey",
                                    "Config",
                                ],
                                "includeTags": [
                                    "slot=main",
                                ],
                            }
                        ),
                        "key": base64.b64encode(view_key).decode(),
                    },
                ],
            },
            StrawberryDjangoContext(request=request, response=None),
        )
