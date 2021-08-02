import { gql } from '@apollo/client'

export const serverConfigQuery = gql`
    query serverSecretgraphConfigQuery {
        secretgraph {
            config {
                id
                hashAlgorithms
                injectedClusters {
                    group
                    clusters
                    keys {
                        link
                        hash
                    }
                }
                registerUrl
            }
        }
    }
`
