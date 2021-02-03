import { gql } from '@apollo/client'

export const serverConfigQuery = gql`
    query serverSecretgraphConfigQuery {
        secretgraph {
            config {
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
