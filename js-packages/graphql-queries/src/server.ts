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
                    properties {
                        name
                        description
                    }
                    description
                    injectedKeys {
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
