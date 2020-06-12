import { graphql } from "react-relay"

export const createContentMutation = graphql`
  mutation contentCreateServerEncryptedMutation($cluster: ID!, $info: [String!], $references: [ReferenceInput!], $value: Upload!, $contentHash: String) {
    updateOrCreateContent(
      input: {
        content: { cluster: $cluster, info: $info, value: { value: $value }, contentHash: $contentHash, references: $references }
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
  query contentConfigQuery {
    contents(
      public: false,
      includeInfo: ["type=Config", "type=PrivateKey"]
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
