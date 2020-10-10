import { gql } from '@apollo/client';


export const createContentMutation = gql`
  mutation contentEncryptedMutation($cluster: ID!, $tags: [String!], $references: [ReferenceInput!], $value: Upload!, $nonce: String, $contentHash: String, $authorization: [String!]) {
    updateOrCreateContent(
      input: {
        content: {
          cluster: $cluster
          value: {
            tags: $tags
            value: $value
            nonce: $nonce
          }
          contentHash: $contentHash
          references: $references
        }
        authorization: $authorization
      }
    ) {
      content {
        nonce
        link
      }
      writeok
    }
  }
`

export const contentQuery = gql`
  query contentRetrieveQuery($id: ID!, $keyhashes: [String!], $authorization: [String!]) {
    content(
      id: $id, authorization: $authorization
    ) {
      id
      nonce
      link
      tags
      cluster {
        publicInfo
      }
      references(groups: ["key", "signature"], includeTags: $keyhashes) {
        edges {
          node {
            extra
            target {
              tags(includeTags: ["hash=", "key="])
            }
          }
        }
      }
    }
  }
`

export const findConfigQuery = gql`
  query contentConfigQuery($cluster: ID, $authorization: [String!], $contentHashes: [String!]) {
    secretgraphConfig {
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
          references(groups: ["key"]) {
            edges {
              node {
                extra
                target {
                  tags(includeTags: ["key_hash"])
                  referencedBy(groups: ["public_key"]) {
                    edges {
                      node {
                        extra
                        target {
                          id
                          tags(includeTags: ["key=", "key_hash="])
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
`
