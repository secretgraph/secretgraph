import { gql } from '@apollo/client'

export const clusterFeedQuery = gql`
    query clusterFeedQuery(
        $authorization: [String!]
        $include: [String!]
        $exclude: [String!]
        $deleted: Boolean
        $public: Boolean
        $count: Int
        $cursor: String
    ) {
        clusters: secretgraph(authorization: $authorization) {
            clusters(
                includeTags: $include
                excludeTags: $exclude
                deleted: $deleted
                public: $public
                first: $count
                after: $cursor
            )
                @connection(
                    key: "feedClusters"
                    filter: [
                        "authorization"
                        "includeTags"
                        "excludeTags"
                        "public"
                        "deleted"
                    ]
                ) {
                edges {
                    node {
                        deleted
                        updateId
                        link
                        id
                        description
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

export const getClusterConfigurationQuery = gql`
    query clusterGetConfigurationQuery($id: ID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                registerUrl
                injectedClusters {
                    group
                    clusters
                    keys {
                        link
                        hash
                    }
                }
            }
            node(id: $id) {
                ... on Cluster {
                    id
                    group
                    link
                    availableActions {
                        keyHash
                        type
                        requiredKeys
                        allowedTags
                    }
                }
            }
        }
    }
`

// has also description
export const getClusterQuery = gql`
    query clusterGetClusterQuery($id: ID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                injectedClusters {
                    group
                    clusters
                    keys {
                        link
                        hash
                    }
                }
            }
            node(id: $id) {
                ... on Cluster {
                    id
                    deleted
                    group
                    link
                    description
                    updateId
                    availableActions {
                        keyHash
                        type
                        requiredKeys
                        allowedTags
                    }
                }
            }
        }
    }
`

export const createClusterMutation = gql`
    mutation clusterCreateMutation(
        $description: String
        $actions: [ActionInput!]
        $publicKey: Upload!
        $privateKey: Upload
        $privateTags: [String!]!
        $nonce: String
        $authorization: [String!]
    ) {
        updateOrCreateCluster(
            input: {
                cluster: {
                    description: $description
                    actions: $actions
                    key: {
                        publicKey: $publicKey
                        publicTags: ["state=public"]
                        privateKey: $privateKey
                        privateTags: $privateTags
                        nonce: $nonce
                    }
                }
                authorization: $authorization
            }
        ) {
            cluster {
                id
                group
                link
                description
                updateId
                availableActions {
                    keyHash
                    type
                    requiredKeys
                    allowedTags
                }
            }
            writeok
        }
    }
`

export const updateClusterMutation = gql`
    mutation clusterUpdateMutation(
        $id: ID!
        $updateId: ID!
        $description: String
        $actions: [ActionInput!]
        $authorization: [String!]
    ) {
        updateOrCreateCluster(
            input: {
                id: $id
                updateId: $updateId
                cluster: { description: $description, actions: $actions }
                authorization: $authorization
            }
        ) {
            cluster {
                id
                group
                link
                description
                updateId
                availableActions {
                    keyHash
                    type
                    requiredKeys
                    allowedTags
                }
            }
            writeok
        }
    }
`
