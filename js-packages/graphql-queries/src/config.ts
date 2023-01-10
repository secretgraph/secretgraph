import { gql } from '@apollo/client'

// references required for decrypting and verifying
export const updateConfigQuery = gql`
    query contentUpdateConfigQuery(
        $cluster: ID!
        $authorization: [String!]
        $configContentHashes: [String!]
        $configTags: [String!]
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
                    includeTags: $configTags
                }
            )
                @connection(
                    key: "configUpdateQuery"
                    filter: [
                        "id"
                        "authorization"
                        "configContentHashes"
                        "configTags"
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
                        tags(includeTags: ["slot=", "key_hash="])
                        contentHash

                        references(
                            filters: {
                                groups: ["key", "signature"]
                                includeTags: $configTags
                            }
                        ) {
                            edges {
                                node {
                                    extra
                                    target {
                                        link
                                        type
                                        tags(includeTags: ["key_hash="])
                                    }
                                }
                            }
                        }
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
        $configTags: [String!]
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
                    includeTags: $configTags
                }
            )
                @connection(
                    key: "configQuery"
                    filter: [
                        "cluster"
                        "authorization"
                        "configContentHashes"
                        "configTags"
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
