import { graphql } from "react-relay"

export const createContentMutation = graphql`
  mutation createServerEncryptedContent($cluster: ID!, $key: string, $info: [string!], $references: [ReferenceInput!], $value: Upload!, $contentHash: string) {
    updateOrCreateContent(
      content={ cluster=$cluster, info=$info, value={ value: $value }, contentHash=$contentHash },
      key=$key
    ) {
      content {
        nonce
        link
      }
    }
  }
`
export const findConfig = graphql`
  queryConfigContent() {
    contents(
      public=false,
      includeInfo=["type=Config", "type=PrivateKey"]
    ) {
      content {
        nonce
        link
      }
    }
  }
`
