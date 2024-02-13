import { gql } from '@apollo/client'

export const deleteNodes = gql`
    mutation nodeDelete($ids: [ID!]!, $authorization: [String!]) {
        secretgraph {
            deleteContentOrCluster(
                input: { ids: $ids, authorization: $authorization }
            ) {
                latestDeletion
            }
        }
    }
`
export const resetDeletionNodes = gql`
    mutation nodeResetDelete($ids: [ID!]!, $authorization: [String!]) {
        secretgraph {
            resetDeletionContentOrCluster(
                input: { ids: $ids, authorization: $authorization }
            ) {
                restored
            }
        }
    }
`

export const getActionsQuery = gql`
    query nodeGetActions($id: GlobalID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
            }
            node(id: $id) {
                ... on Cluster {
                    availableActions {
                        keyHash
                        type
                        allowedTags
                    }
                }
                ... on Content {
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

export const getNodeType = gql`
    query getNodeTypeQuery($id: GlobalID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Cluster {
                    id
                    public
                    featured
                    primary
                    name
                }
                ... on Content {
                    id
                    type
                    state
                    cluster {
                        id
                    }
                }
            }
        }
    }
`

export const addActionsMutation = gql`
    mutation nodeAddActionsMutation(
        $ids: [GlobalID!]!
        $actions: [ActionInput!]
        $authorization: [String!]
    ) {
        secretgraph {
            updateMetadata(
                input: {
                    ids: $ids
                    actions: $actions
                    operation: APPEND
                    authorization: $authorization
                }
            ) {
                updated
            }
        }
    }
`

export const getPermissions = gql`
    query getPermissionsQuery($authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            permissions
        }
    }
`

export const authQuery = gql`
    query authQuery(
        $id: GlobalID!
        $authorization: [String!]
        $keyhashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Cluster {
                    id
                    availableActions {
                        keyHash
                        type
                        allowedTags
                    }
                    auth {
                        requester
                        challenge
                        signatures
                    }
                }
                ... on Content {
                    id
                    availableActions {
                        keyHash
                        type
                        allowedTags
                    }
                    cryptoParameters
                    link
                    type
                    auth {
                        requester
                        challenge
                        signatures
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
