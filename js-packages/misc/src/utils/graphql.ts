import { ApolloClient, InMemoryCache, split } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { relayStylePagination } from '@apollo/client/utilities'
import { createUploadLink } from 'apollo-upload-client'
import { createClient as SubscriptionCreateClient } from 'graphql-ws'

declare var __DEV__: any
const dev = typeof __DEV__ != 'undefined' && __DEV__

export const createClient = (url: string) => {
    const uploadLink = new createUploadLink({
        uri: url,
    })

    const wsLink = new GraphQLWsLink(
        SubscriptionCreateClient({
            url: url.replace(/^http:/, 'ws:/').replace(/^https:/, 'wss:/'),
        })
    )
    const splitLink = split(
        ({ query }) => {
            const definition = getMainDefinition(query)

            return (
                definition.kind === 'OperationDefinition' &&
                definition.operation === 'subscription'
            )
        },

        wsLink,
        uploadLink
    )
    return new ApolloClient({
        connectToDevTools: dev,
        cache: new InMemoryCache({
            typePolicies: {
                ActionEntry: {
                    merge: false,
                },
                Content: {
                    fields: {
                        availableActions: {
                            merge: false,
                        },
                    },
                },
                Cluster: {
                    fields: {
                        availableActions: {
                            merge: false,
                        },
                    },
                },
                SecretgraphObject: {
                    queryType: true,
                    fields: {
                        clusters: relayStylePagination([
                            'authorization',
                            'filters',
                        ]),
                        contents: relayStylePagination([
                            'authorization',
                            'filters',
                        ]),
                    },
                },
            },
        }),
        link: splitLink,
        name: 'secretgraph',
        version: '0.1',
        queryDeduplication: !dev,
        defaultOptions: {
            watchQuery: {
                fetchPolicy: 'cache-and-network',
            },
        },
    })
}
