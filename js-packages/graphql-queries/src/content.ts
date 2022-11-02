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
                filters: {
                    includeTypes: $types
                    excludeTypes: []
                    states: $states
                    clusters: $clusters
                    includeTags: $include
                    excludeTags: $exclude
                    deleted: $deleted
                    public: $public
                }
                first: $count
                after: $cursor
            )
                @connection(
                    key: "feedContents"
                    filter: [
                        "authorization"
                        "types"
                        "states"
                        "clusters"
                        "include"
                        "exclude"
                        "includeTags"
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
                            filters: {
                                groups: ["key", "signature"]
                                includeTags: $include
                            }
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
        $net: ID
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
                    net: $net
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
            ... on ContentMutation {
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
                    net: $cluster
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
            ... on ContentMutation {
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
    }
`
export const updateKeyMutation = gql`
    mutation contentUpdateKeyMutation(
        $id: GlobalID!
        $updateId: ID!
        $net: ID
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
                    net: $net
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
            ... on ContentMutation {
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
    }
`

export const updateContentMutation = gql`
    mutation contentUpdateEncryptedMutation(
        $id: GlobalID!
        $updateId: ID!
        $cluster: ID
        $net: ID
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
                    net: $net
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
            ... on ContentMutation {
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
    }
`

export const findPublicKeyQuery = gql`
    query contentFindPublicKeyQuery($id: GlobalID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
                    type
                    state
                    references(filters: { groups: ["public_key"] }) {
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
// publicKey -> privateKey -> (key tag | references to public keys (have shared key)) and signature references
export const keysRetrievalQuery = gql`
    query keysRetrievalQuery(
        $id: GlobalID!
        $authorization: [String!]
        $keyhashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
            }
            """ public key """
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
                    """signatures with public key """
                    references(
                        filters: { groups: ["signature"], deleted: FALSE }
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
                    referencedBy(filters: { groups: ["public_key"] }) {
                        edges {
                            node {
                                extra
                                """ private key """
                                source {
                                    id
                                    deleted
                                    link
                                    nonce
                                    updateId
                                    state
                                    type
                                    """ decrypt private key via key= tag """
                                    tags
                                    """ decrypt private key via references to public key """
                                    references(
                                        filters: {
                                            groups: ["key"]
                                            includeTags: $keyhashes
                                        }
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
        $id: GlobalID!
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
                    state
                    type
                    contentHash
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
                    """signatures """
                    references(
                        filters: {
                            groups: ["key", "signature"]
                            includeTags: $keyhashes
                        }
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
        $cluster: ID!
        $authorization: [String!]
        $configContentHashes: [String!]
        $configKeyHashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
            }
            contents(
                filters: {
                    public: FALSE
                    deleted: FALSE
                    clusters: [$cluster]
                    includeTypes: ["Config"]
                    contentHashes: $configContentHashes
                    includeTags: $configKeyHashes
                }
            )
                @connection(
                    key: "configQuery"
                    filter: [
                        "id"
                        "authorization"
                        "configContentHashes"
                        "configKeyHashes"
                    ]
                ) {
                edges {
                    node {
                        id
                        nonce
                        link
                        tags
                        updateId
                        references(filters: { groups: ["key"] }) {
                            edges {
                                node {
                                    extra
                                    target {
                                        tags(includeTags: ["key_hash="])
                                        contentHash
                                        link
                                        referencedBy(
                                            filters: { groups: ["public_key"] }
                                        ) {
                                            edges {
                                                node {
                                                    extra
                                                    source {
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
    query contentGetConfigurationQuery(
        $id: GlobalID!
        $authorization: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                maxRelayResults
                groups {
                    name
                    injectedKeys {
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
                        filters: {
                            includeTypes: ["PublicKey"]
                            states: ["required", "trusted"]
                            deleted: FALSE
                        }
                    ) {
                        edges {
                            node {
                                id
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
                    nonce
                    link
                    type
                    cluster {
                        id
                        groups
                        contents(
                            filters: {
                                includeTypes: ["PublicKey"]
                                states: ["required", "trusted"]
                                deleted: FALSE
                            }
                        ) {
                            edges {
                                node {
                                    id
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

export const getContentReferencesQuery = gql`
    query contentGetReferencesQuery(
        $id: GlobalID!
        $authorization: [String!]
        $deleted: Boolean
        $count: Int
        $cursor: String
    ) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
                    references(
                        filters: { deleted: $deleted }
                        first: $count
                        after: $cursor
                    )
                        @connection(
                            key: "feedReferences"
                            filter: ["authorization", "id"]
                        ) {
                        edges {
                            node {
                                extra
                                target {
                                    id
                                    link
                                    type
                                    tags(includeTags: ["name=", "~name="])
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
        }
    }
`

export const getContentReferencedByQuery = gql`
    query contentGetReferencedByQuery(
        $id: GlobalID!
        $authorization: [String!]
        $deleted: Boolean
        $count: Int
        $cursor: String
    ) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
                    referencedBy(
                        first: $count
                        after: $cursor
                        filters: { deleted: $deleted }
                    )
                        @connection(
                            key: "feedReferencedBy"
                            filter: ["authorization", "id", "deleted"]
                        ) {
                        edges {
                            node {
                                extra
                                target {
                                    deleted
                                    id
                                    link
                                    type
                                    tags(includeTags: ["name=", "~name="])
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
        }
    }
`
