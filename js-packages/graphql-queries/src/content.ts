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
                                groups: ["key", "signature", "transfer"]
                                includeTags: $include
                            }
                        ) {
                            edges {
                                node {
                                    extra
                                    group
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

export const transferMutation = gql`
    mutation transferMutation(
        $id: GlobalID!
        $url: String!
        $headers: JSON
        $authorization: [String!]
    ) {
        secretgraph {
            transferContent(
                input: {
                    id: $id
                    url: $url
                    headers: $headers
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
        secretgraph {
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
                            references: $references
                        }
                        contentHash: $contentHash
                    }
                    authorization: $authorization
                }
            ) {
                content {
                    id
                    updateId
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
        secretgraph {
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
                            references: $references
                        }
                        contentHash: $contentHash
                    }
                    updateId: $updateId
                    authorization: $authorization
                }
            ) {
                content {
                    id
                    updateId
                    nonce
                    link
                    type
                    state
                }
                writeok
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
                asymmeticEncryptionAlgorithms
                signatureAlgorithms
                clusterGroups {
                    name
                    description
                    hidden
                    injectedKeys {
                        link
                        hash
                    }
                }
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
                        allowedTags
                    }
                    cluster {
                        id
                    }
                    references(
                        filters: {
                            groups: ["key", "signature", "transfer"]
                            includeTags: $keyhashes
                        }
                    ) {
                        edges {
                            node {
                                extra
                                group
                                target {
                                    link
                                    type
                                    state
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
        $deleted: UseCriteria
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
                                group
                                target {
                                    id
                                    link
                                    type
                                    state
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

export const getContentConfigurationQuery = gql`
    query contentGetConfigurationQuery(
        $id: GlobalID!
        $authorization: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                asymmeticEncryptionAlgorithms
                signatureAlgorithms
                maxRelayResults
                clusterGroups {
                    name
                    description
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
                                state
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
                                    state
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

export const getContentReferencedByQuery = gql`
    query contentGetReferencedByQuery(
        $id: GlobalID!
        $authorization: [String!]
        $deleted: UseCriteria
        $groups: [String!]
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
                        filters: { deleted: $deleted, groups: $groups }
                    )
                        @connection(
                            key: "feedReferencedBy"
                            filter: [
                                "authorization"
                                "id"
                                "groups"
                                "deleted"
                            ]
                        ) {
                        edges {
                            node {
                                extra
                                group
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

export const getContentRelatedQuery = gql`
    query contentGetRelatedQuery(
        $id: GlobalID!
        $authorization: [String!]
        $deleted: UseCriteria
        $groups: [String!]
        $keyhashes: [String!]
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
                        filters: {
                            deleted: $deleted
                            groups: $groups
                            excludeTags: ["transfer_url=", "~transfer_url="]
                        }
                    )
                        @connection(
                            key: "feedRelatedBy"
                            filter: [
                                "authorization"
                                "id"
                                "groups"
                                "deleted"
                            ]
                        ) {
                        edges {
                            node {
                                extra
                                group
                                target {
                                    deleted
                                    id
                                    link
                                    type
                                    tags
                                    references(
                                        filters: {
                                            groups: ["key", "signature"]
                                            includeTags: $keyhashes
                                        }
                                    ) {
                                        edges {
                                            node {
                                                extra
                                                group
                                                target {
                                                    link
                                                    type
                                                    state
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

export const findOriginsQuery = gql`
    query contentFindOriginsQuery(
        $id: GlobalID!
        $authorization: [String!]
        $groups: [String!]!
    ) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
                    type
                    state
                    references(filters: { groups: $groups }) {
                        edges {
                            node {
                                target {
                                    id
                                    updateId
                                    link
                                    type
                                    state
                                    cluster {
                                        id
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

export const contentVerificationQuery = gql`
    query contentVerificationQuery($id: GlobalID!, $includeTags: [String!]) {
        secretgraph {
            node(id: $id) {
                ... on Content {
                    references(
                        filters: {
                            groups: ["signature"]
                            includeTags: $includeTags
                        }
                    ) {
                        edges {
                            node {
                                extra
                                group
                                target {
                                    link
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
        }
    }
`
