import { gql } from '@apollo/client'

export const serverConfigQuery = gql`
    query serverSecretgraphConfigQuery {
        secretgraph {
            config {
                id
                hashAlgorithms
                groups {
                    name
                    hidden
                    properties
                    description
                    injected_keys {
                        id
                        link
                        hash
                    }
                }
                registerUrl
            }
        }
    }
`
