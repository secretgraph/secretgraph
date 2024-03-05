import { gql } from '@apollo/client'

export const serverConfigQuery = gql`
    query serverSecretgraphConfigQuery {
        secretgraph {
            config {
                id
                hashAlgorithms
                maxRelayResults
                clusterGroups {
                    name
                    description
                    userSelectable
                    hidden
                    properties
                    injectedKeys {
                        link
                        hash
                    }
                }
                netGroups {
                    name
                    description
                    userSelectable
                    hidden
                    properties
                }
                canDirectRegister
                registerUrl
                loginUrl
            }
            activeUser
        }
    }
`

export const serverConfigQueryWithPermissions = gql`
    query serverSecretgraphConfigWithPermissionsQuery(
        $authorization: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            config {
                id
                hashAlgorithms
                maxRelayResults
                clusterGroups {
                    name
                    description
                    userSelectable
                    hidden
                    properties
                    injectedKeys {
                        link
                        hash
                    }
                }
                netGroups {
                    name
                    description
                    userSelectable
                    hidden
                    properties
                }
                canDirectRegister
                registerUrl
                loginUrl
            }
            activeUser
            permissions
        }
    }
`

export const serverLogout = gql`
    mutation serverLogoutMutation {
        secretgraph {
            logoutUser
        }
    }
`
