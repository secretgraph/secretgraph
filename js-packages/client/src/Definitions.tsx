import {
    validActions,
    validNotLoggedInActions,
} from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    authInfoFromConfig,
    updateConfigReducer,
} from '@secretgraph/misc/utils/config'
import {
    InvalidPrefix,
    checkPrefix,
    fromGraphqlId,
    toGraphqlId,
} from '@secretgraph/misc/utils/encoding'
import { createClient } from '@secretgraph/misc/utils/graphql'
import * as React from 'react'

import * as Contexts from './contexts'
import Main from './pages/Main'
import { Writeable } from '@secretgraph/misc/typing'

type Props = {
    defaultPath?: string
    homeUrl?: string
    config: Interfaces.ConfigInterface | null
    updateConfig: React.Dispatch<
        React.ReducerAction<typeof updateConfigReducer>
    >
}

function updateStateSearch<T>(state: T, update: Partial<T>): T {
    const newState = Object.assign({}, state)
    for (const key of Object.keys(update) as (keyof typeof update)[]) {
        let val = update[key]
        if (val !== undefined) {
            newState[key] = val as any
        }
    }
    return newState
}
function updateStateMain<T>(state: T, update: Partial<T>): T {
    const newState = Object.assign({}, state)
    for (const key of Object.keys(update) as (keyof typeof update)[]) {
        let val = update[key]
        if (key == 'editCluster' || key == 'currentCluster') {
            // check cluster
            try {
                checkPrefix(val as string | null | undefined, {
                    prefix: 'Cluster:',
                    b64: true,
                })
            } catch (error) {
                console.error(`error for key ${String(key)}`, error)
                continue
            }
        }
        if (val !== undefined) {
            newState[key] = val as any
        }
    }
    return newState
}
type updateStateType<T> = (state: T, update: Partial<T>) => T

function Definitions({
    defaultPath,
    homeUrl,
    config,
    updateConfig: updateConfigIntern,
}: Props) {
    const searchInit = new URLSearchParams(window.location.hash.substring(1))
    const [openSidebar, _setOpenSidebar] = React.useState(() => {
        return JSON.parse(sessionStorage.getItem('openSidebar') || 'true')
    })
    function setOpenSidebar(arg: boolean) {
        sessionStorage.setItem('openSidebar', JSON.stringify(arg))
        _setOpenSidebar(arg)
    }
    const updateConfig = (
        update: Interfaces.ConfigInputInterface | null,
        replace?: boolean
    ) => updateConfigIntern({ update, replace })
    const [activeUrl, setActiveUrl] = React.useState(
        () => (config ? config.baseUrl : defaultPath) as string
    )
    const [loginUrl, setLoginUrl] = React.useState<string>('')
    const [mainCtx, updateMainCtx] = React.useReducer<
        updateStateType<Interfaces.MainContextInterface>,
        URLSearchParams
    >(updateStateMain, searchInit, (query) => {
        const vActions = config ? validActions : validNotLoggedInActions
        let action: Interfaces.MainContextInterface['action'] = config
            ? 'create'
            : 'login'
        if (vActions.has(query.get('action') as any)) {
            action = query.get('action') as any
        }
        let cluster = query.get('cluster') || null
        if (cluster) {
            cluster = toGraphqlId('Cluster', cluster)
        }
        const ctx: Interfaces.MainContextInterface = {
            action,
            title: '',
            securityLevel: null,
            securityWarningArmed: true,
            readonly: true,
            item: query.get('item'),
            updateId: null,
            url: query.get('url') || activeUrl,
            type: query.get('type') || 'Cluster',
            shareFn: null,
            openDialog: null,
            deleted: null,
            tokens: [],
            tokensPermissions: new Set(),
            currentCluster: cluster,
            editCluster: cluster,
            cloneData: null,
        }
        // initialize clusters when type = Cluster and therefore no cluster query parameter exists
        if (ctx.type == 'Cluster' && !ctx.currentCluster) {
            try {
                checkPrefix(ctx.item, { prefix: 'Cluster:', b64: true })
                ctx.currentCluster = ctx.item
                ctx.editCluster = ctx.item
            } catch (exc) {}
        }
        if (ctx.action == 'clone' && window.opener?.cloneData) {
            ctx.action = 'create'
            ctx.cloneData = window.opener!.cloneData
        }
        if (ctx.action == 'login' || loginUrl.length) {
            if (!loginUrl.length) {
                const loginUrlQuery = query.get('loginUrl')
                if (loginUrlQuery) {
                    setLoginUrl(loginUrlQuery)
                }
            }
        } else {
            if (
                ctx.action != 'create' &&
                ctx.action != 'register' &&
                ctx.action != 'help'
            ) {
                ctx.type = ':loading'
            }
            if (config) {
                setLoginUrl('')
                const require = new Set(['manage'])
                const authinfo = authInfoFromConfig({
                    config,
                    url: ctx.url || config.baseUrl,
                    require,
                })
                ctx.tokens = authinfo.tokens
                ctx.tokensPermissions = require
            }
        }
        return ctx
    })
    React.useEffect(() => {
        const search = new URLSearchParams()
        search.set('action', mainCtx.action)
        if (mainCtx.action == 'create' && mainCtx.type) {
            search.set('type', mainCtx.type)
        } else if (mainCtx.item) {
            search.set('item', mainCtx.item)
        }
        // why cluster? Otherwise we would load !all tokens for all clusters and could get easily bigger,
        // than the 100 tokens limit
        if (mainCtx.currentCluster && mainCtx.type != 'Cluster') {
            let nCluster = fromGraphqlId(mainCtx.currentCluster)
            if (nCluster) {
                search.set('cluster', nCluster[1])
            }
        }

        if (mainCtx.url) {
            search.set('url', mainCtx.url)
        }
        if (loginUrl.length) {
            search.set('loginUrl', loginUrl)
        } else {
            search.delete('loginUrl')
        }
        window.location.hash = search.toString()
    }, [
        mainCtx.action,
        mainCtx.type,
        mainCtx.item,
        mainCtx.currentCluster,
        mainCtx.url,
        loginUrl,
    ])

    const [searchCtx, updateSearchCtx] = React.useReducer<
        updateStateType<Interfaces.SearchContextInterface>
    >(updateStateSearch, {
        cluster: null,
        include: [],
        exclude: [],
        deleted: false,
    })
    const [message, sendMessage] =
        React.useState<React.ContextType<typeof Contexts.Snackbar>['message']>(
            undefined
        )
    const navClient = React.useMemo(() => {
        return createClient(activeUrl)
    }, [activeUrl, !config])
    // keeps navClient until baseUrl changes or if initial baseUrl differs from navClient
    const configClient = React.useMemo(() => {
        if (config && config.baseUrl != activeUrl) {
            return createClient(config.baseUrl)
        }
        return navClient
    }, [config ? config.baseUrl : ''])
    const itemClient = React.useMemo(() => {
        if (mainCtx.url && mainCtx.url != activeUrl) {
            return createClient(mainCtx.url)
        }
        return navClient
    }, [mainCtx.url ? mainCtx.url : ''])

    const goToNode = (node: any) => {
        let type = node.__typename == 'Cluster' ? 'Cluster' : node.type
        if (type == 'PrivateKey') {
            type = 'PublicKey'
        }
        let tokens: string[] = []
        let tokensPermissions: Set<string> = new Set()
        if (config) {
            const retrieveOptions: Writeable<
                Parameters<typeof authInfoFromConfig>[0]
            > = {
                config,
                url: new URL(activeUrl, window.location.href).href,
            }
            if (type == 'Cluster') {
                if (node?.id) {
                    retrieveOptions['clusters'] = new Set([node.id])
                }
            } else if (node?.cluster?.id) {
                retrieveOptions['clusters'] = new Set([node.cluster.id])
                retrieveOptions['contents'] = new Set([node.id])
            }
            const res = authInfoFromConfig(retrieveOptions)
            tokens = res.tokens
            tokensPermissions = res.types
        }
        let name = ''
        if (type == 'Cluster') {
            name = node.name
        } else {
            for (const tag of node.tags) {
                if (tag.startsWith('name=')) {
                    name = tag.match(/=(.*)/)[1]
                    break
                }
            }
        }

        updateMainCtx({
            item: node.id,
            securityLevel: null,
            securityWarningArmed: true,
            readonly: true,
            currentCluster:
                type == 'Cluster' ? node.id : node?.cluster?.id || null,
            editCluster:
                type == 'Cluster' ? node.id : node?.cluster?.id || null,
            updateId: node.updateId,
            type,
            deleted: false,
            action: 'view',
            url: activeUrl,
            shareFn: null,
            openDialog: null,
            title: mainCtx.updateId == node.updateId ? undefined : name,
            tokens,
            tokensPermissions,
            cloneData: null,
        })
    }

    return (
        <Contexts.External.Provider
            value={{
                defaultPath: defaultPath ?? '/graphql',
                homeUrl,
            }}
        >
            <Contexts.LoginUrl.Provider
                value={{
                    loginUrl,
                    setLoginUrl,
                }}
            >
                <Contexts.OpenSidebar.Provider
                    value={{
                        open: openSidebar,
                        setOpen: setOpenSidebar,
                    }}
                >
                    <Contexts.Clients.Provider
                        value={{
                            navClient,
                            itemClient,
                            baseClient: configClient,
                        }}
                    >
                        <Contexts.ActiveUrl.Provider
                            value={{ activeUrl, setActiveUrl }}
                        >
                            <Contexts.Main.Provider
                                value={{ mainCtx, updateMainCtx, goToNode }}
                            >
                                <Contexts.Search.Provider
                                    value={{
                                        searchCtx,
                                        updateSearchCtx,
                                    }}
                                >
                                    <Contexts.Config.Provider
                                        value={{ config, updateConfig }}
                                    >
                                        <Contexts.Snackbar.Provider
                                            value={{
                                                message,
                                                sendMessage,
                                            }}
                                        >
                                            <Main />
                                        </Contexts.Snackbar.Provider>
                                    </Contexts.Config.Provider>
                                </Contexts.Search.Provider>
                            </Contexts.Main.Provider>
                        </Contexts.ActiveUrl.Provider>
                    </Contexts.Clients.Provider>
                </Contexts.OpenSidebar.Provider>
            </Contexts.LoginUrl.Provider>
        </Contexts.External.Provider>
    )
}

export default React.memo(Definitions)
