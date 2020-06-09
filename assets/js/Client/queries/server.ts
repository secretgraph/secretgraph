import { graphql } from "react-relay"

export const serverConfigQuery = graphql`
  query serverSecretgraphConfigQuery {
    secretgraphConfig {
      hashAlgorithms
      PBKDF2Iterations
      injectedClusters
      registerUrl
    }
  }
`
