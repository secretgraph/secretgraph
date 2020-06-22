import { graphql } from "react-relay"

export const serverConfigQuery = graphql`
  query serverSecretgraphConfigQuery {
    secretgraphConfig {
      hashAlgorithms
      PBKDF2Iterations
      injectedClusters {
        group
        clusters
        links {
          link
          hash
        }
      }
      registerUrl
      baseUrl
    }
  }
`
