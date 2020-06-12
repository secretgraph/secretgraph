
import { graphql } from "react-relay"

export const createClusterMutation = graphql`
  mutation clusterCreateSimpleMutation($key: String) {
    updateOrCreateCluster(
      input: {
        key: $key
      }
    ) {
      cluster {
        id
      }
      actionKey
      privateKey
      keyForPrivateKey
      publicKeyHash
    }
  }
`
