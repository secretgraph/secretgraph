import { gql } from '@apollo/client'

export const serverConfigQuery = gql`
    query serverSecretgraphConfigQuery {
        secretgraph {
            config {
                hashAlgorithms
                PBKDF2Iterations
                injectedClusters {
                    group
                    clusters
                    links {
                        link
                        hash
                    }
                }
                registerUrl
            }
        }
    }
`
