import { gql } from '@apollo/client'

export const deleteNode = gql`
    mutation nodeDelete($id: ID!, $authorization: [String!]) {
        deleteContentOrCluster(
            input: { id: $id, authorization: $authorization }
        )
    }
`
export const resetDeletionNode = gql`
    mutation nodeResetDelete($id: ID!, $authorization: [String!]) {
        resetDeletionContentOrCluster(
            input: { id: $id, authorization: $authorization }
        )
    }
`
