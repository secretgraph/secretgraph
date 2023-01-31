import { gql } from '@apollo/client'

export const serverConfigQuery = gql`
    query serverSecretgraphConfigQuery {
        secretgraph {
            config {
                id
                hashAlgorithms
                maxRelayResults
                groups {
                    name
                    hidden
                    properties
                    description
                    injectedKeys {
                        link
                        contentHash
                    }
                }
                registerUrl
            }
        }
    }
`

export const serverConfigQueryWithPermissions = gql`
    query serverSecretgraphConfigWithPermissionsQuery(
        $authorization: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            permissions
            config {
                id
                hashAlgorithms
                maxRelayResults
                groups {
                    name
                    hidden
                    properties
                    description
                    injectedKeys {
                        link
                        contentHash
                    }
                }
                registerUrl
            }
        }
    }
`
