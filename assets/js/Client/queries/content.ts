import { graphql } from "react-relay"

export const createContentMutation = graphql`
  mutation contentEncryptedMutation($cluster: ID!, $info: [String!], $references: [ReferenceInput!], $value: Upload!, $nonce: String, $contentHash: String, $authorization: [String!]) {
    updateOrCreateContent(
      input: {
        content: {
          cluster: $cluster
          value: {
            info: $info
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
    }
  }
`

export const findConfigQuery = graphql`
  query contentConfigQuery($cluster: ID, $contentHashes: String, $authorization: [String!]) {
    secretgraphConfig {
      baseUrl
    }
    contents(
      public: false
      cluster: $cluster
      includeInfo: ["type=Config"]
      authorization: $authorization
      contentHashes: contentHashes
    ) {
      edges {
        node {
          id
          nonce
          link
          info
          contentHash
          availableActions {
            keyHash
            type
          }
        }
      }
    }
  }
`
