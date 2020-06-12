
import { graphql } from "react-relay"

export const createClusterMutation = graphql`
  mutation clusterCreateSimpleMutation($actionKey: String!, $publicKey: String!, $privateKey: String!, $nonce: String!) {
    updateOrCreateCluster(
      input: {
        cluster: {
          actions: [
            {
              value: "{\"action\": \"manage\"}"
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
