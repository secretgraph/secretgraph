import { gql } from '@apollo/client'

export const deleteNodes = gql`
    mutation nodesDelete($ids: [ID!]!, $authorization: [String!]) {
        deleteContentOrCluster(
            input: { ids: $ids, authorization: $authorization }
        ) {
            latestDeletion
        }
    }
`
export const resetDeletionNodes = gql`
    mutation nodesResetDelete($ids: [ID!]!, $authorization: [String!]) {
        resetDeletionContentOrCluster(
            input: { ids: $ids, authorization: $authorization }
        ) {
            restored
        }
    }
`
