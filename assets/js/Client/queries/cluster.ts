
import { gql } from '@apollo/client';

export const getClusterConfigurationQuery = gql`
  query clusterGetConfigurationQuery($id: ID!, $authorization: [String!]) {
    secretgraph(authorization: $authorization){
      config {
        injectedClusters {
          group
          clusters
          links {
            link
            hash
          }
        }
        node(id: $id) {
          ... on Cluster{
            id
            group
            availableActions {
              keyHash
              type
              requiredKeys
              allowedTags
            }
          }
        }
      }
    }
  }
`

// has also publicInfo
export const getClusterQuery = gql`
  query clusterGetClusterQuery($id: ID!, $authorization: [String!]) {
    secretgraph(authorization: $authorization){
      config {
        injectedClusters {
          group
          clusters
          links {
            link
            hash
          }
        }
      }
      node(id: $id) {
        ... on Cluster {
          id
          link
          group
          publicInfo
          availableActions {
            keyHash
            type
            requiredKeys
            allowedTags
          }
        }
      }
    }
  }
`


export const createClusterMutation = gql`
  mutation clusterCreateMutation($publicInfo: Upload, $actions: [ActionInput!], $publicKey: Upload!, $privateKey: Upload, $privateTags: [String!]!, $nonce: String, $authorization: [String!]) {
    updateOrCreateCluster(
      input: {
        cluster: {
          publicInfo: $publicInfo
          actions: $actions
          key: {
            publicKey: $publicKey
            publicTags: ["state=public"]
            privateKey: $privateKey
            privateTags: $privateTags
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
          allowedTags
        }
      }
      writeok
    }
  }
`


export const updateClusterMutation = gql`
  mutation clusterUpdateMutation($id: ID!, $publicInfo: Upload, $actions: [ActionInput!], $authorization: [String!]) {
    updateOrCreateCluster(
      input: {
        cluster: {
          id: $id
          publicInfo: $publicInfo
          actions: $actions
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
          allowedTags
        }
      }
      writeok
    }
  }
`
