"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
exports.__esModule = true;
exports.getContentConfigurationQuery = exports.findConfigQuery = exports.contentRetrievalQuery = exports.keysRetrievalQuery = exports.findPublicKeyQuery = exports.updateContentMutation = exports.updateKeyMutation = exports.createKeysMutation = exports.createContentMutation = void 0;
var client_1 = require("@apollo/client");
exports.createContentMutation = client_1.gql(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n    mutation contentCreateEncryptedMutation(\n        $cluster: ID!\n        $tags: [String!]\n        $references: [ReferenceInput!]\n        $value: Upload!\n        $nonce: String\n        $contentHash: String\n        $authorization: [String!]\n        $actions: [ActionInput!]\n    ) {\n        updateOrCreateContent(\n            input: {\n                content: {\n                    cluster: $cluster\n                    value: {\n                        tags: $tags\n                        value: $value\n                        nonce: $nonce\n                        actions: $actions\n                    }\n                    contentHash: $contentHash\n                    references: $references\n                }\n                authorization: $authorization\n            }\n        ) {\n            content {\n                id\n                nonce\n                link\n                updateId\n            }\n            writeok\n        }\n    }\n"], ["\n    mutation contentCreateEncryptedMutation(\n        $cluster: ID!\n        $tags: [String!]\n        $references: [ReferenceInput!]\n        $value: Upload!\n        $nonce: String\n        $contentHash: String\n        $authorization: [String!]\n        $actions: [ActionInput!]\n    ) {\n        updateOrCreateContent(\n            input: {\n                content: {\n                    cluster: $cluster\n                    value: {\n                        tags: $tags\n                        value: $value\n                        nonce: $nonce\n                        actions: $actions\n                    }\n                    contentHash: $contentHash\n                    references: $references\n                }\n                authorization: $authorization\n            }\n        ) {\n            content {\n                id\n                nonce\n                link\n                updateId\n            }\n            writeok\n        }\n    }\n"])));
exports.createKeysMutation = client_1.gql(templateObject_2 || (templateObject_2 = __makeTemplateObject(["\n    mutation contentCreateKeysMutation(\n        $cluster: ID!\n        $publicTags: [String!]!\n        $publicActions: [ActionInput!]\n        $privateTags: [String!]!\n        $privateActions: [ActionInput!]\n        $references: [ReferenceInput!]\n        $publicKey: Upload!\n        $privateKey: Upload\n        $nonce: String\n        $contentHash: String\n        $authorization: [String!]\n    ) {\n        updateOrCreateContent(\n            input: {\n                content: {\n                    cluster: $cluster\n                    key: {\n                        publicKey: $publicKey\n                        privateKey: $privateKey\n                        nonce: $nonce\n                        privateTags: $privateTags\n                        privateActions: $privateActions\n                        publicTags: $publicTags\n                        publicActions: $publicActions\n                    }\n                    contentHash: $contentHash\n                    references: $references\n                }\n                authorization: $authorization\n            }\n        ) {\n            content {\n                id\n                nonce\n                link\n                updateId\n            }\n            writeok\n        }\n    }\n"], ["\n    mutation contentCreateKeysMutation(\n        $cluster: ID!\n        $publicTags: [String!]!\n        $publicActions: [ActionInput!]\n        $privateTags: [String!]!\n        $privateActions: [ActionInput!]\n        $references: [ReferenceInput!]\n        $publicKey: Upload!\n        $privateKey: Upload\n        $nonce: String\n        $contentHash: String\n        $authorization: [String!]\n    ) {\n        updateOrCreateContent(\n            input: {\n                content: {\n                    cluster: $cluster\n                    key: {\n                        publicKey: $publicKey\n                        privateKey: $privateKey\n                        nonce: $nonce\n                        privateTags: $privateTags\n                        privateActions: $privateActions\n                        publicTags: $publicTags\n                        publicActions: $publicActions\n                    }\n                    contentHash: $contentHash\n                    references: $references\n                }\n                authorization: $authorization\n            }\n        ) {\n            content {\n                id\n                nonce\n                link\n                updateId\n            }\n            writeok\n        }\n    }\n"])));
exports.updateKeyMutation = client_1.gql(templateObject_3 || (templateObject_3 = __makeTemplateObject(["\n    mutation contentUpdateKeyMutation(\n        $id: ID!\n        $updateId: ID!\n        $cluster: ID\n        $actions: [ActionInput!]\n        $tags: [String!]\n        $references: [ReferenceInput!]\n        $key: Upload\n        $nonce: String\n        $contentHash: String\n        $authorization: [String!]\n    ) {\n        updateOrCreateContent(\n            input: {\n                id: $id\n                content: {\n                    cluster: $cluster\n                    key: {\n                        publicKey: $key\n                        privateKey: $key\n                        nonce: $nonce\n                        privateTags: $tags\n                        privateActions: $actions\n                        publicTags: $tags\n                        publicActions: $actions\n                    }\n                    contentHash: $contentHash\n                    references: $references\n                }\n                updateId: $updateId\n                authorization: $authorization\n            }\n        ) {\n            content {\n                id\n                nonce\n                link\n                updateId\n            }\n            writeok\n        }\n    }\n"], ["\n    mutation contentUpdateKeyMutation(\n        $id: ID!\n        $updateId: ID!\n        $cluster: ID\n        $actions: [ActionInput!]\n        $tags: [String!]\n        $references: [ReferenceInput!]\n        $key: Upload\n        $nonce: String\n        $contentHash: String\n        $authorization: [String!]\n    ) {\n        updateOrCreateContent(\n            input: {\n                id: $id\n                content: {\n                    cluster: $cluster\n                    key: {\n                        publicKey: $key\n                        privateKey: $key\n                        nonce: $nonce\n                        privateTags: $tags\n                        privateActions: $actions\n                        publicTags: $tags\n                        publicActions: $actions\n                    }\n                    contentHash: $contentHash\n                    references: $references\n                }\n                updateId: $updateId\n                authorization: $authorization\n            }\n        ) {\n            content {\n                id\n                nonce\n                link\n                updateId\n            }\n            writeok\n        }\n    }\n"])));
exports.updateContentMutation = client_1.gql(templateObject_4 || (templateObject_4 = __makeTemplateObject(["\n    mutation contentUpdateEncryptedMutation(\n        $id: ID!\n        $updateId: ID!\n        $cluster: ID\n        $tags: [String!]\n        $actions: [ActionInput!]\n        $references: [ReferenceInput!]\n        $value: Upload\n        $nonce: String\n        $contentHash: String\n        $authorization: [String!]\n    ) {\n        updateOrCreateContent(\n            input: {\n                id: $id\n                content: {\n                    cluster: $cluster\n                    value: {\n                        tags: $tags\n                        value: $value\n                        nonce: $nonce\n                        actions: $actions\n                    }\n                    contentHash: $contentHash\n                    references: $references\n                }\n                updateId: $updateId\n                authorization: $authorization\n            }\n        ) {\n            content {\n                id\n                nonce\n                link\n                updateId\n            }\n            writeok\n        }\n    }\n"], ["\n    mutation contentUpdateEncryptedMutation(\n        $id: ID!\n        $updateId: ID!\n        $cluster: ID\n        $tags: [String!]\n        $actions: [ActionInput!]\n        $references: [ReferenceInput!]\n        $value: Upload\n        $nonce: String\n        $contentHash: String\n        $authorization: [String!]\n    ) {\n        updateOrCreateContent(\n            input: {\n                id: $id\n                content: {\n                    cluster: $cluster\n                    value: {\n                        tags: $tags\n                        value: $value\n                        nonce: $nonce\n                        actions: $actions\n                    }\n                    contentHash: $contentHash\n                    references: $references\n                }\n                updateId: $updateId\n                authorization: $authorization\n            }\n        ) {\n            content {\n                id\n                nonce\n                link\n                updateId\n            }\n            writeok\n        }\n    }\n"])));
exports.findPublicKeyQuery = client_1.gql(templateObject_5 || (templateObject_5 = __makeTemplateObject(["\n    query contentFindPublicKeyQuery($id: ID!, $authorization: [String!]) {\n        secretgraph(authorization: $authorization) {\n            node(id: $id) {\n                ... on Content {\n                    id\n                    tags(includeTags: [\"type=\"])\n                    references(groups: [\"public_key\"]) {\n                        edges {\n                            node {\n                                target {\n                                    id\n                                    updateId\n                                    link\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"], ["\n    query contentFindPublicKeyQuery($id: ID!, $authorization: [String!]) {\n        secretgraph(authorization: $authorization) {\n            node(id: $id) {\n                ... on Content {\n                    id\n                    tags(includeTags: [\"type=\"])\n                    references(groups: [\"public_key\"]) {\n                        edges {\n                            node {\n                                target {\n                                    id\n                                    updateId\n                                    link\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"])));
exports.keysRetrievalQuery = client_1.gql(templateObject_6 || (templateObject_6 = __makeTemplateObject(["\n    query contentKeyRetrievalQuery(\n        $id: ID!\n        $authorization: [String!]\n        $keyhashes: [String!]\n    ) {\n        secretgraph(authorization: $authorization) {\n            config {\n                id\n                hashAlgorithms\n            }\n            node(id: $id) {\n                ... on Content {\n                    id\n                    deleted\n                    link\n                    updateId\n                    tags\n                    cluster {\n                        id\n                    }\n                    references(\n                        groups: [\"signature\"]\n                        includeTags: $keyhashes\n                        deleted: false\n                    ) {\n                        edges {\n                            node {\n                                extra\n                                target {\n                                    link\n                                    tags(includeTags: [\"type=\", \"key_hash=\"])\n                                }\n                            }\n                        }\n                    }\n                    referencedBy(groups: [\"public_key\"]) {\n                        edges {\n                            node {\n                                extra\n                                source {\n                                    id\n                                    deleted\n                                    link\n                                    nonce\n                                    updateId\n                                    tags\n                                    references(\n                                        groups: [\"key\"]\n                                        includeTags: $keyhashes\n                                    ) {\n                                        edges {\n                                            node {\n                                                extra\n                                                target {\n                                                    link\n                                                    tags(\n                                                        includeTags: [\n                                                            \"type=\"\n                                                            \"key_hash=\"\n                                                        ]\n                                                    )\n                                                }\n                                            }\n                                        }\n                                    }\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"], ["\n    query contentKeyRetrievalQuery(\n        $id: ID!\n        $authorization: [String!]\n        $keyhashes: [String!]\n    ) {\n        secretgraph(authorization: $authorization) {\n            config {\n                id\n                hashAlgorithms\n            }\n            node(id: $id) {\n                ... on Content {\n                    id\n                    deleted\n                    link\n                    updateId\n                    tags\n                    cluster {\n                        id\n                    }\n                    references(\n                        groups: [\"signature\"]\n                        includeTags: $keyhashes\n                        deleted: false\n                    ) {\n                        edges {\n                            node {\n                                extra\n                                target {\n                                    link\n                                    tags(includeTags: [\"type=\", \"key_hash=\"])\n                                }\n                            }\n                        }\n                    }\n                    referencedBy(groups: [\"public_key\"]) {\n                        edges {\n                            node {\n                                extra\n                                source {\n                                    id\n                                    deleted\n                                    link\n                                    nonce\n                                    updateId\n                                    tags\n                                    references(\n                                        groups: [\"key\"]\n                                        includeTags: $keyhashes\n                                    ) {\n                                        edges {\n                                            node {\n                                                extra\n                                                target {\n                                                    link\n                                                    tags(\n                                                        includeTags: [\n                                                            \"type=\"\n                                                            \"key_hash=\"\n                                                        ]\n                                                    )\n                                                }\n                                            }\n                                        }\n                                    }\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"])));
exports.contentRetrievalQuery = client_1.gql(templateObject_7 || (templateObject_7 = __makeTemplateObject(["\n    query contentRetrievalQuery(\n        $id: ID!\n        $keyhashes: [String!]\n        $authorization: [String!]\n        $includeTags: [String!]\n    ) {\n        secretgraph(authorization: $authorization) {\n            config {\n                hashAlgorithms\n            }\n            node(id: $id) {\n                ... on Content {\n                    id\n                    deleted\n                    nonce\n                    link\n                    updateId\n                    tags(includeTags: $includeTags)\n                    availableActions {\n                        id\n                        keyHash\n                        type\n                        requiredKeys\n                        allowedTags\n                    }\n                    cluster {\n                        id\n                    }\n                    references(\n                        groups: [\"key\", \"signature\"]\n                        includeTags: $keyhashes\n                    ) {\n                        edges {\n                            node {\n                                extra\n                                target {\n                                    link\n                                    tags(includeTags: [\"type\", \"key_hash=\"])\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"], ["\n    query contentRetrievalQuery(\n        $id: ID!\n        $keyhashes: [String!]\n        $authorization: [String!]\n        $includeTags: [String!]\n    ) {\n        secretgraph(authorization: $authorization) {\n            config {\n                hashAlgorithms\n            }\n            node(id: $id) {\n                ... on Content {\n                    id\n                    deleted\n                    nonce\n                    link\n                    updateId\n                    tags(includeTags: $includeTags)\n                    availableActions {\n                        id\n                        keyHash\n                        type\n                        requiredKeys\n                        allowedTags\n                    }\n                    cluster {\n                        id\n                    }\n                    references(\n                        groups: [\"key\", \"signature\"]\n                        includeTags: $keyhashes\n                    ) {\n                        edges {\n                            node {\n                                extra\n                                target {\n                                    link\n                                    tags(includeTags: [\"type\", \"key_hash=\"])\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"])));
exports.findConfigQuery = client_1.gql(templateObject_8 || (templateObject_8 = __makeTemplateObject(["\n    query contentFindConfigQuery(\n        $cluster: ID\n        $authorization: [String!]\n        $contentHashes: [String!]\n    ) {\n        secretgraph(authorization: $authorization) {\n            config {\n                hashAlgorithms\n            }\n            contents(\n                public: false\n                deleted: false\n                clusters: [$cluster]\n                includeTags: [\"type=Config\"]\n                contentHashes: $contentHashes\n            ) {\n                edges {\n                    node {\n                        id\n                        nonce\n                        link\n                        tags\n                        updateId\n                        references(groups: [\"key\"]) {\n                            edges {\n                                node {\n                                    extra\n                                    target {\n                                        tags(includeTags: [\"key_hash=\"])\n                                        contentHash\n                                        link\n                                        referencedBy(groups: [\"public_key\"]) {\n                                            edges {\n                                                node {\n                                                    extra\n                                                    target {\n                                                        id\n                                                        tags(\n                                                            includeTags: [\n                                                                \"key=\"\n                                                                \"key_hash=\"\n                                                            ]\n                                                        )\n                                                        nonce\n                                                        link\n                                                    }\n                                                }\n                                            }\n                                        }\n                                    }\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"], ["\n    query contentFindConfigQuery(\n        $cluster: ID\n        $authorization: [String!]\n        $contentHashes: [String!]\n    ) {\n        secretgraph(authorization: $authorization) {\n            config {\n                hashAlgorithms\n            }\n            contents(\n                public: false\n                deleted: false\n                clusters: [$cluster]\n                includeTags: [\"type=Config\"]\n                contentHashes: $contentHashes\n            ) {\n                edges {\n                    node {\n                        id\n                        nonce\n                        link\n                        tags\n                        updateId\n                        references(groups: [\"key\"]) {\n                            edges {\n                                node {\n                                    extra\n                                    target {\n                                        tags(includeTags: [\"key_hash=\"])\n                                        contentHash\n                                        link\n                                        referencedBy(groups: [\"public_key\"]) {\n                                            edges {\n                                                node {\n                                                    extra\n                                                    target {\n                                                        id\n                                                        tags(\n                                                            includeTags: [\n                                                                \"key=\"\n                                                                \"key_hash=\"\n                                                            ]\n                                                        )\n                                                        nonce\n                                                        link\n                                                    }\n                                                }\n                                            }\n                                        }\n                                    }\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"])));
exports.getContentConfigurationQuery = client_1.gql(templateObject_9 || (templateObject_9 = __makeTemplateObject(["\n    query contentGetConfigurationQuery($id: ID!, $authorization: [String!]) {\n        secretgraph(authorization: $authorization) {\n            config {\n                hashAlgorithms\n                injectedClusters {\n                    group\n                    keys {\n                        link\n                        hash\n                    }\n                }\n            }\n            node(id: $id) {\n                ... on Cluster {\n                    id\n                    group\n                    link\n                    availableActions {\n                        keyHash\n                        type\n                        requiredKeys\n                        allowedTags\n                    }\n\n                    contents(includeTags: [\"type=PublicKey\"], deleted: false) {\n                        edges {\n                            node {\n                                link\n                                tags(includeTags: [\"key_hash=\", \"type=\"])\n                            }\n                        }\n                    }\n                }\n                ... on Content {\n                    id\n                    availableActions {\n                        keyHash\n                        type\n                        requiredKeys\n                        allowedTags\n                    }\n                    id\n                    nonce\n                    link\n                    tags(includeTags: [\"type=\"])\n                    cluster {\n                        id\n                        group\n                        contents(\n                            includeTags: [\"type=PublicKey\"]\n                            deleted: false\n                        ) {\n                            edges {\n                                node {\n                                    link\n                                    tags(includeTags: [\"key_hash=\", \"type=\"])\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"], ["\n    query contentGetConfigurationQuery($id: ID!, $authorization: [String!]) {\n        secretgraph(authorization: $authorization) {\n            config {\n                hashAlgorithms\n                injectedClusters {\n                    group\n                    keys {\n                        link\n                        hash\n                    }\n                }\n            }\n            node(id: $id) {\n                ... on Cluster {\n                    id\n                    group\n                    link\n                    availableActions {\n                        keyHash\n                        type\n                        requiredKeys\n                        allowedTags\n                    }\n\n                    contents(includeTags: [\"type=PublicKey\"], deleted: false) {\n                        edges {\n                            node {\n                                link\n                                tags(includeTags: [\"key_hash=\", \"type=\"])\n                            }\n                        }\n                    }\n                }\n                ... on Content {\n                    id\n                    availableActions {\n                        keyHash\n                        type\n                        requiredKeys\n                        allowedTags\n                    }\n                    id\n                    nonce\n                    link\n                    tags(includeTags: [\"type=\"])\n                    cluster {\n                        id\n                        group\n                        contents(\n                            includeTags: [\"type=PublicKey\"]\n                            deleted: false\n                        ) {\n                            edges {\n                                node {\n                                    link\n                                    tags(includeTags: [\"key_hash=\", \"type=\"])\n                                }\n                            }\n                        }\n                    }\n                }\n            }\n        }\n    }\n"])));
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9;
//# sourceMappingURL=content.js.map