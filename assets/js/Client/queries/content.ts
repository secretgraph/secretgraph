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

export const findConfig = graphql`
  query contentConfigQuery($authorization: [String!]) {
    contents(
      public: false,
      includeInfo: ["type=Config", "type=PrivateKey"],
      authorization: $authorization
    ) {
      edges {
        node {
          nonce
          link
        }
      }
    }
  }
`
