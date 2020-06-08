
import { graphql } from "react-relay"

export const createClusterMutation = graphql`
  mutation createSimpleCluster($key: string) {
    updateOrCreateCluster(
      key=$key
    ) {
      cluster {
        id
      }
      actionKey
      privateKey
      keyForPrivateKey
    }
  }
`
