import { gql } from '@apollo/client'

export const clusterFeedQuery = gql`
    query clusterFeedQuery(
        $authorization: [String!]
        $states: [String!]
        $types: [String!]
        $include: [String!]
        $exclude: [String!]
        $excludeIds: [String!]
        $deleted: UseCriteria
        $public: UseCriteriaPublic
        $search: String
        $count: Int
        $cursor: String
    ) {
        clusters: secretgraph(authorization: $authorization) {
            clusters(
                includeTypes: $types
                excludeTypes: ["Config", "PrivateKey"]
                states: $states
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
                        "states"
                        "types"
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
                        name
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
                    group
                    availableActions {
                        keyHash
                        type
                        trustedKeys
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
                    deleted
                    group
                    name
                    description
                    public
                    featured
                    updateId
                    availableActions {
                        keyHash
                        type
                        trustedKeys
                        allowedTags
                    }
                }
            }
        }
    }
`

export const createClusterMutation = gql`
    mutation clusterCreateMutation(
        $name: String
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
                    name: $name
                    description: $description
                    actions: $actions
                    featured: $featured
                    public: $public
                    key: {
                        publicKey: $publicKey
                        publicState: "public"
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
                name
                description
                public
                featured
                updateId
                availableActions {
                    keyHash
                    type
                    trustedKeys
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
        $name: String
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
                    name: $name
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
                name
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
