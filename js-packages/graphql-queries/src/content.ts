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
                groups {
                    name
                    injectedKeys {
                        link
                        contentHash
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
                maxRelayResults
                groups {
                    name
                    injectedKeys {
                        link
                        contentHash
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
