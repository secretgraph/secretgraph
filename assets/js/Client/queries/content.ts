import { graphql } from "react-relay"

export const createContentMutation = graphql`
  mutation contentEncryptedMutation($cluster: ID!, $info: [String!], $references: [ReferenceInput!], $value: Upload!, $nonce: String, $contentHash: String, $authorization: [String!]) {
    secretgraphAuth(authorization: $authorization) {
      ok
    }
    updateOrCreateContent(
      input: {
        content: { cluster: $cluster, value: { info: $info, value: $value, nonce: $nonce }, contentHash: $contentHash, references: $references }
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
