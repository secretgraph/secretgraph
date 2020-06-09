import { graphql } from "react-relay"

export const createContentMutation = graphql`
  mutation contentCreateServerEncryptedMutation($cluster: ID!, $key: String, $info: [String!], $references: [ReferenceInput!], $value: Upload!, $contentHash: String) {
    updateOrCreateContent(
      input: {
        content: { cluster: $cluster, info: $info, value: { value: $value }, contentHash: $contentHash, references: $references },
        key: $key
      }
    ) {
      content {
        nonce
        link
      }
    }
  }
`


export const findConfig = `
  query contentConfigQuery {
    contents(
      public: false,
      includeInfo: ["type=Config", "type=PrivateKey"]
    ) {
      content {
        nonce
        link
      }
    }
  }
`
