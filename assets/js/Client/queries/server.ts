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

export const getConfigurationQuery = gql`
    query contentGetConfigurationQuery($id: ID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                injectedClusters {
                    group
                    links {
                        link
                        hash
                    }
                }
                node(id: $id) {
                    ... on Cluster {
                        id
                        group
                        link
                        availableActions {
                            keyHash
                            type
                            requiredKeys
                            allowedTags
                        }

                        contents(
                            groups: ["key"]
                            includeTags: ["type=PublicKey"]
                        ) {
                            edges {
                                node {
                                    link
                                    tags(includeTags: ["key_hash="])
                                }
                            }
                        }
                    }
                    ... on Content {
                        id
                        group
                        availableActions {
                            keyHash
                            type
                            requiredKeys
                            allowedTags
                        }
                        id
                        nonce
                        link
                        updateId
                        tags(includeTags: $includeTags)
                        cluster {
                            id
                            contents(
                                groups: ["key"]
                                includeTags: ["type=PublicKey"]
                            ) {
                                edges {
                                    node {
                                        link
                                        tags(includeTags: ["key_hash="])
                                    }
                                }
                            }
                        }
                        references(groups: ["key"], includeTags: $keyhashes) {
                            edges {
                                node {
                                    extra
                                    target {
                                        link
                                        tags(includeTags: ["key_hash="])
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`
