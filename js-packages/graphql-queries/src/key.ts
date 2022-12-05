import { gql } from '@apollo/client'

export const createKeysMutation = gql`
    mutation contentCreateKeysMutation(
        $cluster: ID!
        $publicTags: [String!]!
        $privateTags: [String!]!
        $publicActions: [ActionInput!]
        $privateActions: [ActionInput!]
        $references: [ReferenceInput!]
        $publicState: String
        $publicKey: Upload!
        $privateKey: Upload
        $nonce: String
        $authorization: [String!]
    ) {
        updateOrCreateContent(
            input: {
                content: {
                    cluster: $cluster
                    net: $cluster
                    key: {
                        publicKey: $publicKey
                        privateKey: $privateKey
                        nonce: $nonce
                        privateTags: $privateTags
                        privateActions: $privateActions
                        publicTags: $publicTags
                        publicActions: $publicActions
                        publicState: $publicState
                    }
                    references: $references
                }
                authorization: $authorization
            }
        ) {
            ... on ContentMutation {
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
`
export const updateKeyMutation = gql`
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
                    }
                    contentHash: $contentHash
                    references: $references
                }
                updateId: $updateId
                authorization: $authorization
            }
        ) {
            ... on ContentMutation {
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
`

export const findPublicKeyQuery = gql`
    query contentFindPublicKeyQuery($id: GlobalID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
                    type
                    state
                    references(filters: { groups: ["public_key"] }) {
                        edges {
                            node {
                                target {
                                    id
                                    updateId
                                    link
                                    type
                                    state
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

// needs type because this attribute is checked for the extra key tag extractor pass
// publicKey -> privateKey -> (key tag | references to public keys (have shared key)) and signature references
export const keysRetrievalQuery = gql`
    query keysRetrievalQuery(
        $id: GlobalID!
        $authorization: [String!]
        $keyhashes: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
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
                        trustedKeys
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
`
export const trustedKeysRetrieval = gql`
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
                        contentHash
                        references(
                            filters: {
                                groups: ["signature"]
                                includeTags: $keyHashes
                            }
                        ) {
                            edges {
                                node {
                                    extra
                                    target {
                                        id
                                        tags(includeTags: ["key_hash="])
                                        contentHash
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
`

export const signKeyMutation = gql`
    mutation contentSignKeyMutation(
        $id: GlobalID!
        $references: [ReferenceInput!]
        $authorization: [String!]
    ) {
        updateMetadata(
            input: {
                ids: [$id]
                references: $references
                operation: APPEND
                authorization: $authorization
            }
        ) {
            ... on MetadataUpdateMutation {
                updated
            }
        }
    }
`
