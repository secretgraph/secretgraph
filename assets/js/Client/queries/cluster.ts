
import { graphql } from "react-relay"

export const createClusterMutation = graphql`
  mutation clusterCreateSimpleMutation($actionKey: String!, $publicKey: Upload!, $privateKey: Upload!, $nonce: String!) {
    updateOrCreateCluster(
      input: {
        cluster: {
          publicInfo: " "
          actions: [
            {
              value: "{ \\\"action\\\": \\\"manage\\\" }"
              key: $actionKey
            }
          ]
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
      privateKey
      keyForPrivateKey
      publicKeyHash
    }
  }
`
