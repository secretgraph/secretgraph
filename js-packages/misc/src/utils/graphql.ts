import { ApolloClient, InMemoryCache } from '@apollo/client'
import { relayStylePagination } from '@apollo/client/utilities'
import { createUploadLink } from 'apollo-upload-client'

declare var __DEV__: any
const dev = typeof __DEV__ != 'undefined' && __DEV__

export const createClient = (url: string) => {
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
        link: createUploadLink({
            uri: url,
        }),
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
