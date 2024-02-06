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
                asymmeticEncryptionAlgorithms
                signatureAlgorithms
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
                                    group
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

export const findConfigIdQuery = gql`
    query contentFindConfigIdQuery(
        $cluster: ID!
        $authorization: [String!]
        $configTags: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            contents(
                filters: {
                    public: FALSE
                    deleted: FALSE
                    clusters: [$cluster]
                    includeTypes: ["Config"]
                    includeTags: $configTags
                }
            )
                @connection(
                    key: "configIdQuery"
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
                        updateId
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
                asymmeticEncryptionAlgorithms
                signatureAlgorithms
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
                                    group
                                    target {
                                        id
                                        tags(includeTags: ["key_hash="])
                                        contentHash
                                        link
                                        state
                                        type
                                        referencedBy(
                                            filters: { groups: ["public_key"] }
                                        ) {
                                            edges {
                                                node {
                                                    extra
                                                    group
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
