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
                content: {
                    id: $id
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

export const contentQuery = gql`
    query contentRetrieveQuery(
        $id: ID!
        $keyhashes: [String!]
        $authorization: [String!]
        $includeTags: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            node(id: $id) {
                ... on Content {
                    id
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
                                    nonce
                                    tags(
                                        includeTags: [
                                            "type"
                                            "key_hash="
                                            "key="
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
`

export const findConfigQuery = gql`
    query contentConfigQuery(
        $cluster: ID
        $authorization: [String!]
        $contentHashes: [String!]
    ) {
        secretgraph {
            config {
                PBKDF2Iterations
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
                                        tags(includeTags: ["key_hash"])
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
