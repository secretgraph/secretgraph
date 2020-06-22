
import { graphql } from "react-relay"

export const getClusterConfigurationQuery = graphql`
  query getClusterConfigurationQuery($id: ID, $authorization: [String!]) {
    secretgraphConfig {
      injectedClusters {
        group
        clusters
        links {
          link
          hash
        }
      }
    }
    cluster(id: $id, authorization: $authorization) @includeif($id) {
      cluster {
        id
        group
        availableActions {
          keyHash
          type
          requiredKeys
          allowedInfo
        }
      }
    }
  }
`


export const createClusterMutation = graphql`
  mutation clusterCreateMutation($publicInfo: String, $actions: [ActionInput!], $publicKey: Upload!, $privateKey: Upload, $nonce: String, $authorization: [String!]) {
    secretgraphConfig {
      injectedClusters {
        group
        clusters
        links
      }
    }
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
        authorization: $authorization
      }
    ) {
      cluster {
        id
        group
        availableActions {
          keyHash
          type
          requiredKeys
          allowedInfo
        }
      }
      actionKey
    }
  }
`
