import { gql } from '@apollo/client'

export const clusterFeedQuery = gql`
    query SideBarClusterFeedQuery(
        $authorization: [String!]
        $include: [String!]
        $exclude: [String!]
        $public: Boolean
        $count: Int
        $cursor: String
    ) {
        clusters: secretgraph(authorization: $authorization) {
            clusters(
                includeTags: $include
                excludeTags: $exclude
                public: $public
                first: $count
                after: $cursor
            )
                @connection(
                    key: "SideBar_clusters"
                    filters: ["include", "exclude", "public"]
                ) {
                edges {
                    node {
                        link
                        id
                        publicInfo
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
                injectedClusters {
                    group
                    clusters
                    links {
                        link
                        hash
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
    }
`

// has also publicInfo
export const getClusterQuery = gql`
    query clusterGetClusterQuery($id: ID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                injectedClusters {
                    group
                    clusters
                    links {
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
                    publicInfo
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
        $publicInfo: Upload
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
                    publicInfo: $publicInfo
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
                publicInfo
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
        $publicInfo: Upload
        $actions: [ActionInput!]
        $authorization: [String!]
    ) {
        updateOrCreateCluster(
            input: {
                id: $id
                updateId: $updateId
                cluster: { publicInfo: $publicInfo, actions: $actions }
                authorization: $authorization
            }
        ) {
            cluster {
                id
                group
                link
                publicInfo
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
