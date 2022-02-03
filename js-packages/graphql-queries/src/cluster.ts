import { gql } from '@apollo/client'

export const clusterFeedQuery = gql`
    query clusterFeedQuery(
        $authorization: [String!]
        $include: [String!]
        $exclude: [String!]
        $excludeIds: [String!]
        $deleted: UseCriteria
        $public: UseCriteria
        $search: String
        $count: Int
        $cursor: String
    ) {
        clusters: secretgraph(authorization: $authorization) {
            clusters(
                includeTags: $include
                excludeTags: $exclude
                excludeIds: $excludeIds
                deleted: $deleted
                public: $public
                search: $search
                first: $count
                after: $cursor
            )
                @connection(
                    key: "feedClusters"
                    filter: [
                        "authorization"
                        "includeTags"
                        "excludeTags"
                        "excludeIds"
                        "public"
                        "search"
                        "deleted"
                    ]
                ) {
                edges {
                    node {
                        deleted
                        updateId
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
                    description
                    public
                    featured
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
        $public: Boolean
        $featured: Boolean
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
                    featured: $featured
                    public: $public
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
                description
                public
                featured
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
        $public: Boolean
        $featured: Boolean
        $actions: [ActionInput!]
        $authorization: [String!]
    ) {
        updateOrCreateCluster(
            input: {
                id: $id
                updateId: $updateId
                cluster: {
                    description: $description
                    actions: $actions
                    featured: $featured
                    public: $public
                }
                authorization: $authorization
            }
        ) {
            cluster {
                id
                group
                description
                updateId
                public
                featured
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
