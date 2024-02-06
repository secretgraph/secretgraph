import { gql } from '@apollo/client'

export const serverConfigQuery = gql`
    query serverSecretgraphConfigQuery {
        secretgraph {
            config {
                id
                hashAlgorithms
                asymmetricEncryptionAlgorithms
                signatureAlgorithms
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
            permissions
            config {
                id
                hashAlgorithms
                asymmetricEncryptionAlgorithms
                signatureAlgorithms
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

export const serverLogout = gql`
    mutation serverLogoutMutation {
        secretgraph {
            logoutUser
        }
    }
`
