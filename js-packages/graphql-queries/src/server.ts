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
                    properties {
                        name
                        description
                    }
                    description
                    injectedKeys {
                        link
                        hash
                    }
                }
                registerUrl
            }
        }
    }
`
