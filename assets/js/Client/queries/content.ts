import { gql } from '@apollo/client'

export const createContentMutation = gql`
    mutation contentCreateEncryptedMutation(
        $cluster: ID!
        $tags: [String!]
        $references: [ReferenceInput!]
        $value: Upload!
        $nonce: String
        $contentHash: String
        $authorization: [String!]
    ) {
        updateOrCreateContent(
            input: {
                content: {
                    cluster: $cluster
                    value: { tags: $tags, value: $value, nonce: $nonce }
                    contentHash: $contentHash
                    references: $references
                }
                authorization: $authorization
            }
        ) {
            content {
                id
                nonce
                link
                updateId
            }
            writeok
        }
    }
`

export const createKeysMutation = gql`
    mutation contentCreateKeysMutation(
        $cluster: ID!
        $publicTags: [String!]!
        $privateTags: [String!]!
        $references: [ReferenceInput!]
        $publicKey: Upload!
        $privateKey: Upload
        $nonce: String
        $contentHash: String
        $authorization: [String!]
    ) {
        updateOrCreateContent(
            input: {
                content: {
                    cluster: $cluster
                    key: {
                        publicKey: $publicKey
                        privateKey: $privateKey
                        nonce: $nonce
                        privateTags: $privateTags
                        publicTags: $publicTags
                    }
                    contentHash: $contentHash
                    references: $references
                }
                authorization: $authorization
            }
        ) {
            content {
                id
                nonce
                link
                updateId
            }
            writeok
        }
    }
`

export const updateContentMutation = gql`
    mutation contentUpdateEncryptedMutation(
        $id: ID!
        $updateId: ID!
        $cluster: ID
        $tags: [String!]
        $references: [ReferenceInput!]
        $value: Upload
        $nonce: String
        $contentHash: String
        $authorization: [String!]
    ) {
        updateOrCreateContent(
            input: {
                id: $id
                content: {
                    cluster: $cluster
                    value: { tags: $tags, value: $value, nonce: $nonce }
                    contentHash: $contentHash
                    references: $references
                }
                updateId: $updateId
                authorization: $authorization
            }
        ) {
            content {
                id
                nonce
                link
                updateId
            }
            writeok
        }
    }
`
export const findPublicKeyQuery = gql`
    query contentFindPublicKeyQuery($id: ID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
                    tags(includeTags: ["type="])
                    references(groups: ["public_key"]) {
                        edges {
                            node {
                                deleteRecursive
                                target {
                                    id
                                    updateId
                                    link
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`

export const keysRetrievalQuery = gql`
    query contentKeyRetrievalQuery(
        $id: ID!
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
                    tags
                    cluster {
                        id
                        publicInfo
                    }
                    references(groups: ["signature"], includeTags: $keyhashes) {
                        edges {
                            node {
                                extra
                                target {
                                    link
                                    tags(includeTags: ["type=", "key_hash="])
                                }
                            }
                        }
                    }
                    referencedBy(groups: ["public_key"]) {
                        edges {
                            node {
                                extra
                                source {
                                    id
                                    deleted
                                    link
                                    nonce
                                    updateId
                                    tags
                                    references(
                                        groups: ["key"]
                                        includeTags: $keyhashes
                                    ) {
                                        edges {
                                            node {
                                                extra
                                                target {
                                                    link
                                                    tags(
                                                        includeTags: [
                                                            "type="
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

export const contentRetrievalQuery = gql`
    query contentRetrievalQuery(
        $id: ID!
        $keyhashes: [String!]
        $authorization: [String!]
        $includeTags: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
                    deleted
                    nonce
                    link
                    updateId
                    tags(includeTags: $includeTags)
                    cluster {
                        id
                        publicInfo
                    }
                    references(
                        groups: ["key", "signature"]
                        includeTags: $keyhashes
                    ) {
                        edges {
                            node {
                                extra
                                target {
                                    link
                                    tags(includeTags: ["type", "key_hash="])
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
        $cluster: ID
        $authorization: [String!]
        $contentHashes: [String!]
    ) {
        secretgraph {
            config {
                hashAlgorithms
            }
            contents(
                public: false
                clusters: [$cluster]
                includeTags: ["type=Config"]
                authorization: $authorization
                contentHashes: $contentHashes
            ) {
                edges {
                    node {
                        id
                        nonce
                        link
                        tags
                        updateId
                        references(groups: ["key"]) {
                            edges {
                                node {
                                    extra
                                    target {
                                        tags(includeTags: ["key_hash="])
                                        contentHash
                                        link
                                        referencedBy(groups: ["public_key"]) {
                                            edges {
                                                node {
                                                    extra
                                                    target {
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

export const getContentConfigurationQuery = gql`
    query contentGetConfigurationQuery($id: ID!, $authorization: [String!]) {
        secretgraph(authorization: $authorization) {
            config {
                hashAlgorithms
                injectedClusters {
                    group
                    keys {
                        link
                        hash
                    }
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

                    contents(includeTags: ["type=PublicKey"]) {
                        edges {
                            node {
                                link
                                tags(includeTags: ["key_hash=", "type="])
                            }
                        }
                    }
                }
                ... on Content {
                    id
                    availableActions {
                        keyHash
                        type
                        requiredKeys
                        allowedTags
                    }
                    id
                    nonce
                    link
                    tags(includeTags: ["type="])
                    cluster {
                        id
                        group
                        contents(includeTags: ["type=PublicKey"]) {
                            edges {
                                node {
                                    link
                                    tags(includeTags: ["key_hash=", "type="])
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`
