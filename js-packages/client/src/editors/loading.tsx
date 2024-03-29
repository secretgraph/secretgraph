import { useApolloClient } from '@apollo/client'
import { getNodeType } from '@secretgraph/graphql-queries/node'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import * as React from 'react'

import * as Contexts from '../contexts'

export default function LoadingComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const client = useApolloClient()
    React.useEffect(() => {
        let active = true
        const f = async () => {
            if (!['update', 'view'].includes(mainCtx.action)) {
                // action is not eligable for loading
                throw new Error(':loading only valid for some actions')
            }
            const require = new Set(
                mainCtx.action == 'update'
                    ? ['manage', 'update']
                    : ['view', 'update', 'manage']
            )
            let authinfo = authInfoFromConfig({
                config,
                url: mainCtx.url || config.baseUrl,
                // we cannot check type here as it is loading
                contents: mainCtx.item ? new Set([mainCtx.item]) : undefined,
                clusters: mainCtx.currentCluster
                    ? new Set([mainCtx.currentCluster])
                    : undefined,
                require,
            })
            if (!authinfo.tokens.length) {
                console.info(
                    'nothing found, remove contents and clusters constraints'
                )
                authinfo = authInfoFromConfig({
                    config,
                    url: mainCtx.url || config.baseUrl,
                    require: require,
                })
            }
            if (mainCtx.item) {
                try {
                    const result = await client.query({
                        query: getNodeType,
                        variables: {
                            authorization: authinfo.tokens,
                            id: mainCtx.item,
                        },
                    })
                    if (active) {
                        if (result.data.secretgraph.node) {
                            if (result.data.secretgraph.node.type) {
                                // type is content
                                updateMainCtx({
                                    type: result.data.secretgraph.node.type,
                                    tokens: authinfo.tokens,
                                    tokensPermissions: authinfo.types,
                                    editCluster:
                                        result.data.secretgraph.node.cluster
                                            .id,
                                    currentCluster:
                                        result.data.secretgraph.node.cluster
                                            .id,
                                })
                            } else {
                                // type is Cluster
                                updateMainCtx({
                                    type: 'Cluster',
                                    tokens: authinfo.tokens,
                                    tokensPermissions: authinfo.types,
                                    editCluster:
                                        result.data.secretgraph.node.id,
                                    currentCluster:
                                        result.data.secretgraph.node.id,
                                })
                            }
                        } else {
                            // e.g. no permissions
                            console.warn('failed to load node, fallback')
                            const authinfo = authInfoFromConfig({
                                config,
                                url: mainCtx.url || config.baseUrl,
                                require: new Set(['manage']),
                            })
                            updateMainCtx({
                                action: 'create',
                                item: null,
                                url: activeUrl,
                                type: 'Cluster',
                                tokens: authinfo.tokens,
                                tokensPermissions: authinfo.types,
                            })
                        }
                    }
                } catch (exc) {
                    // we are lost here and cannot do anything
                    console.error(
                        'failed to determinate/load type for unknown reasons',
                        exc
                    )
                }
            } else {
                // no item was specified, so we cannot determinate what we should load
                const authinfo = authInfoFromConfig({
                    config,
                    url: mainCtx.url || config.baseUrl,
                    require: new Set(['manage']),
                })
                updateMainCtx({
                    action: 'create',
                    item: null,
                    url: activeUrl,
                    type: 'Cluster',
                    tokens: authinfo.tokens,
                    tokensPermissions: authinfo.types,
                })
            }
        }
        f()
        return () => {
            active = false
        }
    }, [mainCtx.url, mainCtx.item])
    return null
}
