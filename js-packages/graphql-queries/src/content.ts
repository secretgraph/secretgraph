import { gql } from '@apollo/client'
export const contentFeedQuery = gql`
    query SideBarContentFeedQuery(
        $clusters: [ID!]
        $authorization: [String!]
        $states: [String!]
        $types: [String!]
        $include: [String!]
        $exclude: [String!]
        $deleted: UseCriteria
        $public: UseCriteriaPublic
        $includeTags: [String!]
        $count: Int
        $cursor: String
    ) {
        contents: secretgraph(authorization: $authorization) {
            contents(
                includeTypes: $types
                excludeTypes: ["Config", "PrivateKey"]
                states: $states
                clusters: $clusters
                includeTags: $include
                excludeTags: $exclude
                deleted: $deleted
                public: $public
                first: $count
                after: $cursor
            )
                @connection(
                    key: "feedContents"
                    filter: [
                        "authorization"
                        "clusters"
                        "types"
                        "clusters"
                        "includeTags"
                        "excludeTags"
                        "deleted"
                        "public"
                    ]
                ) {
                edges {
                    node {
                        id
                        nonce
                        link
                        updateId
                        deleted
                        type
                        state
                        tags(includeTags: $includeTags)
                        references(
                            groups: ["key", "signature"]
                            includeTags: $include
                        ) {
                            edges {
                                node {
                                    extra
                                    target {
                                        tags(includeTags: ["key_hash="])
                                    }
                                }
                            }
                        }
                        availableActions {
                            type
                        }
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    }
`

export const createContentMutation = gql`
    mutation contentCreateEncryptedMutation(
        $cluster: ID!
        $tags: [String!]
        $references: [ReferenceInput!]
        $value: Upload!
        $nonce: String
        $state: String!
        $type: String!
        $contentHash: String
        $authorization: [String!]
        $actions: [ActionInput!]
    ) {
        updateOrCreateContent(
            input: {
                content: {
                    cluster: $cluster
                    value: {
                        state: $state
                        type: $type
                        tags: $tags
                        value: $value
                        nonce: $nonce
                        actions: $actions
                    }
                    contentHash: $contentHash
                    references: $references
                }
                authorization: $authorization
            }
        ) {
            content {
                id
                nonce
                link
                state
                type
                updateId
            }
            writeok
        }
    }
`

export const createKeysMutation = gql`
    mutation contentCreateKeysMutation(
        $cluster: ID!
        $publicTags: [String!]!
        $privateTags: [String!]!
        $publicActions: [ActionInput!]
        $privateActions: [ActionInput!]
        $references: [ReferenceInput!]
        $publicState: String
        $publicKey: Upload!
        $privateKey: Upload
        $nonce: String
        $contentHash: String
        $authorization: [String!]
    ) {
        updateOrCreateContent(
            input: {
                content: {
                    cluster: $cluster
                    key: {
                        publicKey: $publicKey
                        privateKey: $privateKey
                        nonce: $nonce
                        privateTags: $privateTags
                        privateActions: $privateActions
                        publicTags: $publicTags
                        publicActions: $publicActions
                        publicState: $publicState
                    }
                    contentHash: $contentHash
                    references: $references
                }
                authorization: $authorization
            }
        ) {
            content {
                id
                nonce
                link
                state
                type
                updateId
            }
            writeok
        }
    }
`
export const updateKeyMutation = gql`
    mutation contentUpdateKeyMutation(
        $id: ID!
        $updateId: ID!
        $cluster: ID
        $actions: [ActionInput!]
        $publicTags: [String!]
        $publicState: String
        $privateTags: [String!]
        $references: [ReferenceInput!]
        $key: Upload
        $nonce: String
        $contentHash: String
        $authorization: [String!]
    ) {
        updateOrCreateContent(
            input: {
                id: $id
                content: {
                    cluster: $cluster
                    key: {
                        privateKey: $key
                        nonce: $nonce
                        privateTags: $privateTags
                        publicTags: $publicTags
                        publicState: $publicState
                        privateActions: $actions
                        publicActions: $actions
                    }
                    contentHash: $contentHash
                    references: $references
                }
                updateId: $updateId
                authorization: $authorization
            }
        ) {
            content {
                id
                nonce
                link
                type
                state
                updateId
            }
            writeok
        }
    }
`

export const updateContentMutation = gql`
    mutation contentUpdateEncryptedMutation(
        $id: ID!
        $updateId: ID!
        $cluster: ID
        $state: String
        $type: String
        $tags: [String!]
        $actions: [ActionInput!]
        $references: [ReferenceInput!]
        $value: Upload
        $nonce: String
        $contentHash: String
        $authorization: [String!]
    ) {
        updateOrCreateContent(
            input: {
                id: $id
                content: {
                    cluster: $cluster
                    value: {
                        tags: $tags
                        value: $value
                        nonce: $nonce
                        type: $type
                        state: $state
                        actions: $actions
                    }
                    contentHash: $contentHash
                    references: $references
                }
                updateId: $updateId
                authorization: $authorization
            }
        ) {
            content {
                id
                nonce
                link
                type
                state
                updateId
            }
            writeok
        }
    }
`

export const findPublicKeyQuery = gql`
    query contentFindPublicKeyQuery($id: ID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
                    type
                    state
                    references(groups: ["public_key"]) {
                        edges {
                            node {
                                target {
                                    id
                                    updateId
                                    link
                                    type
                                    state
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

// needs type because this attribute is checked for the extra key tag extractor pass
export const keysRetrievalQuery = gql`
    query keysRetrievalQuery(
        $id: ID!
        $authorization: [String!]
        $keyhashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
            }
            node(id: $id) {
                ... on Content {
                    id
                    deleted
                    link
                    updateId
                    state
                    type
                    tags
                    availableActions {
                        keyHash
                        type
                        trustedKeys
                        allowedTags
                    }
                    cluster {
                        id
                    }
                    references(
                        groups: ["signature"]
                        includeTags: $keyhashes
                        deleted: FALSE
                    ) {
                        edges {
                            node {
                                extra
                                target {
                                    link
                                    type
                                    state
                                    tags(includeTags: ["key_hash="])
                                }
                            }
                        }
                    }
                    referencedBy(groups: ["public_key"]) {
                        edges {
                            node {
                                extra
                                source {
                                    id
                                    deleted
                                    link
                                    nonce
                                    updateId
                                    state
                                    type
                                    tags
                                    references(
                                        groups: ["key"]
                                        includeTags: $keyhashes
                                    ) {
                                        edges {
                                            node {
                                                extra
                                                target {
                                                    link
                                                    type
                                                    tags(
                                                        includeTags: [
                                                            "key_hash="
                                                        ]
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

export const contentRetrievalQuery = gql`
    query contentRetrievalQuery(
        $id: ID!
        $keyhashes: [String!]
        $authorization: [String!]
        $includeTags: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
            }
            node(id: $id) {
                ... on Content {
                    id
                    deleted
                    nonce
                    link
                    updateId
                    tags(includeTags: $includeTags)
                    availableActions {
                        keyHash
                        type
                        trustedKeys
                        allowedTags
                    }
                    cluster {
                        id
                    }
                    references(
                        groups: ["key", "signature"]
                        includeTags: $keyhashes
                    ) {
                        edges {
                            node {
                                extra
                                target {
                                    link
                                    type
                                    tags(includeTags: ["key_hash="])
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

export const findConfigQuery = gql`
    query contentFindConfigQuery(
        $cluster: ID
        $authorization: [String!]
        $contentHashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
            }
            contents(
                public: FALSE
                deleted: FALSE
                clusters: [$cluster]
                includeTypes: ["Config"]
                contentHashes: $contentHashes
            ) {
                edges {
                    node {
                        id
                        nonce
                        link
                        tags
                        updateId
                        references(groups: ["key"]) {
                            edges {
                                node {
                                    extra
                                    target {
                                        tags(includeTags: ["key_hash="])
                                        contentHash
                                        link
                                        referencedBy(groups: ["public_key"]) {
                                            edges {
                                                node {
                                                    extra
                                                    target {
                                                        id
                                                        tags(
                                                            includeTags: [
                                                                "key="
                                                                "key_hash="
                                                            ]
                                                        )
                                                        nonce
                                                        link
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

export const getContentConfigurationQuery = gql`
    query contentGetConfigurationQuery($id: ID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                groups {
                    name
                    injected_keys {
                        id
                        link
                        hash
                    }
                }
            }
            node(id: $id) {
                ... on Cluster {
                    id
                    groups
                    availableActions {
                        keyHash
                        type
                        trustedKeys
                        allowedTags
                    }

                    contents(
                        includeTypes: ["PublicKey"]
                        states: ["required", "trusted"]
                        deleted: FALSE
                    ) {
                        edges {
                            node {
                                link
                                type
                                tags(includeTags: ["key_hash="])
                            }
                        }
                    }
                }
                ... on Content {
                    id
                    availableActions {
                        keyHash
                        type
                        trustedKeys
                        allowedTags
                    }
                    id
                    nonce
                    link
                    type
                    cluster {
                        id
                        groups
                        contents(
                            includeTypes: ["PublicKey"]
                            states: ["required", "trusted"]
                            deleted: FALSE
                        ) {
                            edges {
                                node {
                                    link
                                    type
                                    tags(includeTags: ["key_hash="])
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`
