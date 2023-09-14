# WARNING AUTOGENERATED

serverConfigQuery = """
    query serverSecretgraphConfigQuery {
        secretgraph {
            config {
                id
                hashAlgorithms
                maxRelayResults
                clusterGroups {
                    name
                    hidden
                    properties
                    description
                    injectedKeys {
                        link
                        contentHash
                    }
                }
                canDirectRegister
                registerUrl
                loginUrl
            }
            activeUser
        }
    }
"""

serverConfigQueryWithPermissions = """
    query serverSecretgraphConfigWithPermissionsQuery(
        $authorization: [String!]
    ) {
        secretgraph(authorization: $authorization) {
            permissions
            config {
                id
                hashAlgorithms
                maxRelayResults
                clusterGroups {
                    name
                    hidden
                    properties
                    description
                    injectedKeys {
                        link
                        contentHash
                    }
                }
                registerUrl
            }
        }
    }
"""

serverLogout = """
    mutation serverLogoutMutation {
        secretgraph {
            logoutUser
        }
    }
"""