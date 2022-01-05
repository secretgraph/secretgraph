import { ApolloClient, FetchResult } from '@apollo/client'
import {
    deleteNodes as deleteNodeQuery,
    resetDeletionNodes as resetDeletionNodeQuery,
} from '@secretgraph/graphql-queries/node'

export async function deleteNodes({
    ids,
    client,
    authorization,
}: {
    ids: string[]
    client: ApolloClient<any>
    authorization: string[]
}) {
    return await client.mutate({
        mutation: deleteNodeQuery,
        variables: {
            ids,
            authorization,
        },
    })
}

export async function resetDeletionNodes({
    ids,
    client,
    authorization,
}: {
    ids: string[]
    client: ApolloClient<any>
    authorization: string[]
}) {
    return await client.mutate({
        mutation: resetDeletionNodeQuery,
        variables: {
            ids,
            authorization,
        },
    })
}
