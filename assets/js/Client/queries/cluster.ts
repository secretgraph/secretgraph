
import { graphql } from "react-relay"

export const createClusterMutation = graphql`
  mutation clusterCreateMutation($publicInfo: String, $actions: [ActionInput!], $publicKey: Upload!, $privateKey: Upload, $nonce: String) {
    updateOrCreateCluster(
      input: {
        cluster: {
          publicInfo: $publicInfo
          actions: $actions
          key: {
            publicKey: $publicKey
            privateKey: $privateKey
            nonce: $nonce
          }
        }
      }
    ) {
      cluster {
        id
      }
      actionKey
    }
  }
`
