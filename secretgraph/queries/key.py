# WARNING AUTOGENERATED

createKeysMutation = """
    mutation contentCreateKeysMutation(
        $cluster: ID!
        $net: ID
        $publicTags: [String!]!
        $privateTags: [String!]
        $publicActions: [ActionInput!]
        $privateActions: [ActionInput!]
        $references: [ReferenceInput!]
        $publicState: String
        $publicKey: Upload!
        $privateKey: Upload
        $nonce: String
        $authorization: [String!]
    ) {
        secretgraph {
            updateOrCreateContent(
                input: {
                    content: {
                        cluster: $cluster
                        net: $net
                        key: {
                            publicKey: $publicKey
                            privateKey: $privateKey
                            nonce: $nonce
                            privateTags: $privateTags
                            privateActions: $privateActions
                            publicTags: $publicTags
                            publicActions: $publicActions
                            publicState: $publicState
                            references: $references
                        }
                    }
                    authorization: $authorization
                }
            ) {
                content {
                    id
                    nonce
                    link
                    state
                    type
                    updateId
                }
                writeok
            }
        }
    }
"""

updateKeyMutation = """
    mutation contentUpdateKeyMutation(
        $id: GlobalID!
        $updateId: ID!
        $net: ID
        $actions: [ActionInput!]
        $publicTags: [String!]
        $publicState: String
        $privateTags: [String!]
        $references: [ReferenceInput!]
        $key: Upload
        $nonce: String
        $contentHash: String
        $authorization: [String!]
    ) {
        secretgraph {
            updateOrCreateContent(
                input: {
                    id: $id
                    content: {
                        net: $net
                        key: {
                            privateKey: $key
                            nonce: $nonce
                            privateTags: $privateTags
                            publicTags: $publicTags
                            publicState: $publicState
                            privateActions: $actions
                            publicActions: $actions
                            references: $references
                        }
                        contentHash: $contentHash
                    }
                    updateId: $updateId
                    authorization: $authorization
                }
            ) {
                content {
                    id
                    nonce
                    link
                    type
                    state
                    updateId
                }
                writeok
            }
        }
    }
"""

keysRetrievalQuery = """
    query keysRetrievalQuery(
        $id: GlobalID!
        $authorization: [String!]
        $keyhashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                asymmetricEncryptionAlgorithms
                signatureAlgorithms
            }
            node(id: $id) {
                ... on Content {
                    id
                    deleted
                    link
                    updateId
                    state
                    type
                    tags
                    availableActions {
                        keyHash
                        type
                        allowedTags
                    }
                    cluster {
                        id
                    }
                    references(
                        filters: { groups: ["signature"], deleted: FALSE }
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
                    referencedBy(filters: { groups: ["public_key"] }) {
                        edges {
                            node {
                                extra
                                group
                                source {
                                    id
                                    deleted
                                    link
                                    nonce
                                    updateId
                                    state
                                    type
                                    tags
                                    references(
                                        filters: {
                                            groups: ["key"]
                                            includeTags: $keyhashes
                                        }
                                    ) {
                                        edges {
                                            node {
                                                extra
                                                group
                                                target {
                                                    link
                                                    type
                                                    tags(
                                                        includeTags: [
                                                            "key_hash="
                                                        ]
                                                    )
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
"""

trustedKeysRetrieval = """
    query contentTrustedKeysRetrievalQuery(
        $clusters: [ID!]
        $authorization: [String!]
        $keyHashes: [String!]
        $states: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                asymmetricEncryptionAlgorithms
                signatureAlgorithms
            }
            contents(
                filters: {
                    public: TRUE
                    deleted: FALSE
                    clusters: $clusters
                    includeTypes: ["PublicKey"]
                    includeTags: $keyHashes
                    states: $states
                }
            )
                @connection(
                    key: "trustedKeysRetrievalQuery"
                    filter: ["authorization", "keyHashes", "states"]
                ) {
                edges {
                    node {
                        id
                        link
                        tags(includeTags: ["key_hash="])
                        referencedBy(
                            filters: {
                                groups: ["signature"]
                                includeTypes: ["PublicKey"]
                                deleted: FALSE
                                states: $states
                            }
                        ) {
                            edges {
                                node {
                                    extra
                                    group
                                    source {
                                        id
                                        tags(includeTags: ["key_hash="])
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
"""

signKeyMutation = """
    mutation contentSignKeyMutation(
        $id: GlobalID!
        $references: [ReferenceInput!]
        $authorization: [String!]
    ) {
        secretgraph {
            updateMetadata(
                input: {
                    ids: [$id]
                    references: $references
                    operation: APPEND
                    authorization: $authorization
                }
            ) {
                updated
            }
        }
    }
"""
