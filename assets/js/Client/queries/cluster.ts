
import { gql } from '@apollo/client';

export const getClusterConfigurationQuery = gql`
  query clusterGetConfigurationQuery($id: ID!, $authorization: [String!]) {
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
    cluster(id: $id, authorization: $authorization) {
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
`


export const createClusterMutation = gql`
  mutation clusterCreateMutation($publicInfo: Upload, $actions: [ActionInput!], $publicKey: Upload!, $privateKey: Upload, $nonce: String, $authorization: [String!]) {
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
