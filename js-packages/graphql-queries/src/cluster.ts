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
                filters: {
                    includeTypes: $types
                    states: $states
                    includeTags: $include
                    excludeTags: $exclude
                    excludeIds: $excludeIds
                    deleted: $deleted
                    public: $public
                    search: $search
                }
                first: $count
                after: $cursor
            )
                @connection(
                    key: "feedClusters"
                    filter: [
                        "authorization"
                        "types"
                        "states"
                        "include"
                        "exclude"
                        "excludeIds"
                        "deleted"
                        "public"
                        "search"
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
    query clusterGetConfigurationQuery(
        $id: GlobalID!
        $authorization: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                registerUrl
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
                }
            }
        }
    }
`

// has also description
export const getClusterQuery = gql`
    query clusterGetClusterQuery($id: GlobalID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
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
                    deleted
                    groups
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
                        publicState: "trusted"
                        privateKey: $privateKey
                        privateTags: $privateTags
                        publicTags: ["name=initial key"]
                        nonce: $nonce
                    }
                }
                authorization: $authorization
            }
        ) {
            ... on ClusterMutation {
                cluster {
                    id
                    groups
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
    }
`

export const updateClusterMutation = gql`
    mutation clusterUpdateMutation(
        $id: GlobalID!
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
            ... on ClusterMutation {
                cluster {
                    id
                    groups
                    name
                    description
                    updateId
                    public
                    featured
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
    }
`
