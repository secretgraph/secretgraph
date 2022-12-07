import { gql } from '@apollo/client'

export const updateConfigQuery = gql`
    query contentUpdateConfigQuery(
        $cluster: ID!
        $authorization: [String!]
        $configContentHashes: [String!]
        $configKeyHashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
            }
            contents(
                filters: {
                    public: FALSE
                    deleted: FALSE
                    clusters: [$cluster]
                    includeTypes: ["Config"]
                    contentHashes: $configContentHashes
                    includeTags: $configKeyHashes
                }
            )
                @connection(
                    key: "configUpdateQuery"
                    filter: [
                        "id"
                        "authorization"
                        "configContentHashes"
                        "configKeyHashes"
                    ]
                ) {
                edges {
                    node {
                        id
                        availableActions {
                            keyHash
                            type
                            allowedTags
                        }
                        nonce
                        link
                        type
                        cluster {
                            id
                            groups
                            contents(
                                filters: {
                                    includeTypes: ["PublicKey"]
                                    states: ["required", "trusted"]
                                    deleted: FALSE
                                }
                            ) {
                                edges {
                                    node {
                                        id
                                        link
                                        type
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

export const findConfigQuery = gql`
    query contentFindConfigQuery(
        $cluster: ID!
        $authorization: [String!]
        $configContentHashes: [String!]
        $configKeyHashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
            }
            contents(
                filters: {
                    public: FALSE
                    deleted: FALSE
                    clusters: [$cluster]
                    includeTypes: ["Config"]
                    contentHashes: $configContentHashes
                    includeTags: $configKeyHashes
                }
            )
                @connection(
                    key: "configQuery"
                    filter: [
                        "cluster"
                        "authorization"
                        "configContentHashes"
                        "configKeyHashes"
                    ]
                ) {
                edges {
                    node {
                        id
                        nonce
                        link
                        tags
                        updateId
                        contentHash
                        references(filters: { groups: ["key"] }) {
                            edges {
                                node {
                                    extra
                                    target {
                                        id
                                        tags(includeTags: ["key_hash="])
                                        contentHash
                                        link
                                        referencedBy(
                                            filters: { groups: ["public_key"] }
                                        ) {
                                            edges {
                                                node {
                                                    extra
                                                    source {
                                                        id
                                                        tags(
                                                            includeTags: [
                                                                "key="
                                                                "key_hash="
                                                            ]
                                                        )
                                                        nonce
                                                        link
                                                    }
                                                }
                                            }
                                        }
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
