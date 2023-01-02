import { gql } from '@apollo/client'

export const deleteNodes = gql`
    mutation nodeDelete($ids: [ID!]!, $authorization: [String!]) {
        deleteContentOrCluster(
            input: { ids: $ids, authorization: $authorization }
        ) {
            ... on DeleteContentOrClusterMutation {
                latestDeletion
            }
        }
    }
`
export const resetDeletionNodes = gql`
    mutation nodeResetDelete($ids: [ID!]!, $authorization: [String!]) {
        resetDeletionContentOrCluster(
            input: { ids: $ids, authorization: $authorization }
        ) {
            ... on ResetDeletionContentOrClusterMutation {
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
                    name
                }
                ... on Content {
                    id
                    type
                    state
                }
            }
        }
    }
`

export const addActionsMutation = gql`
    mutation nodeAddActionsMutation(
        $id: [GlobalID!]
        $actions: [ActionInput!]
        $authorization: [String!]
    ) {
        updateMetadata(
            input: {
                ids: [$id]
                actions: $actions
                operation: APPEND
                authorization: $authorization
            }
        ) {
            ... on MetadataUpdateMutation {
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
