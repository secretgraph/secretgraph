import { gql } from '@apollo/client'

export const clusterFeedQuery = gql`
    query clusterFeedQuery(
        $authorization: [String!]
        $includeTopics: [String!]
        $excludeTopics: [String!]
        $includeTypes: [String!]
        $excludeTypes: [String!]
        $excludeIds: [ID!]
        $deleted: UseCriteria
        $public: UseCriteriaPublic
        $search: String
        $count: Int
        $cursor: String
    ) {
        clusters: secretgraph(authorization: $authorization) {
            clusters(
                filters: {
                    excludeIds: $excludeIds
                    deleted: $deleted
                    public: $public
                    search: $search
                    includeTopics: $includeTopics
                    excludeTopics: $excludeTopics
                    includeTypes: $includeTypes
                    excludeTypes: $excludeTypes
                }
                first: $count
                after: $cursor
            )
                @connection(
                    key: "feedClusters"
                    filter: [
                        "authorization"
                        "includeTopics"
                        "excludeTopics"
                        "includeTypes"
                        "excludeTypes"
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

// has also description
export const getClusterQuery = gql`
    query getClusterQuery($id: GlobalID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                asymmeticEncryptionAlgorithms
                signatureAlgorithms
                clusterGroups {
                    name
                    description
                    userSelectable
                    hidden
                    properties
                    injectedKeys {
                        link
                        hash
                    }
                }
                netGroups {
                    name
                    description
                    userSelectable
                    hidden
                    properties
                }
            }
            permissions
            node(id: $id) {
                ... on Cluster {
                    id
                    net {
                        groups
                    }
                    deleted
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
                }
            }
        }
    }
`

export const createClusterMutation = gql`
    mutation clusterCreateMutation(
        $name: String
        $description: String
        $featured: Boolean
        $primary: Boolean
        $actions: [ActionInput!]
        $keys: [ContentKeyInput!]
        $clusterGroups: [String!]
        $netGroups: [String!]
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
                        keys: $keys
                        clusterGroups: $clusterGroups
                        netGroups: $netGroups
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
`

export const updateClusterMutation = gql`
    mutation clusterUpdateMutation(
        $id: GlobalID!
        $updateId: ID!
        $name: String
        $description: String
        $featured: Boolean
        $primary: Boolean
        $actions: [ActionInput!]
        $clusterGroups: [String!]
        $netGroups: [String!]
        $authorization: [String!]
    ) {
        secretgraph {
            updateOrCreateCluster(
                input: {
                    id: $id
                    updateId: $updateId
                    cluster: {
                        name: $name
                        description: $description
                        actions: $actions
                        featured: $featured
                        primary: $primary
                        clusterGroups: $clusterGroups
                        netGroups: $netGroups
                    }
                    authorization: $authorization
                }
            ) {
                cluster {
                    id
                    groups
                    name
                    description
                    updateId
                    public
                    featured
                    primary
                    availableActions {
                        keyHash
                        type
                        allowedTags
                    }
                }
                writeok
            }
        }
    }
`
