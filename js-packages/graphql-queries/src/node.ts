import { gql } from '@apollo/client'

export const deleteNodes = gql`
    mutation nodeDelete($ids: [ID!]!, $authorization: [String!]) {
        deleteContentOrCluster(
            input: { ids: $ids, authorization: $authorization }
        ) {
            latestDeletion
        }
    }
`
export const resetDeletionNodes = gql`
    mutation nodeResetDelete($ids: [ID!]!, $authorization: [String!]) {
        resetDeletionContentOrCluster(
            input: { ids: $ids, authorization: $authorization }
        ) {
            restored
        }
    }
`

export const getActionsQuery = gql`
    query nodeGetActions($id: ID!, $authorization: [String!]) {
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
                        trustedKeys
                        allowedTags
                    }
                }
                ... on Content {
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
