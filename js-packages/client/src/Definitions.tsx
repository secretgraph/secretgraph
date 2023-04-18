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
    b64tobuffer,
    fromGraphqlId,
    toGraphqlId,
    utf8ToBinary,
    utf8decoder,
} from '@secretgraph/misc/utils/encoding'
import { createClient } from '@secretgraph/misc/utils/graphql'
import * as React from 'react'

import * as Contexts from './contexts'
import Main from './pages/Main'

type Props = {
    defaultPath?: string
    homeUrl?: string
    config: Interfaces.ConfigInterface | null
    updateConfig: React.Dispatch<
        React.ReducerAction<typeof updateConfigReducer>
    >
}

function updateState<T>(state: T, update: Partial<T>): T {
    const newState = Object.assign({}, state)
    for (const key of Object.keys(update) as (keyof typeof update)[]) {
        let val = update[key]
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
    >(updateState, searchInit, (query) => {
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
        if (ctx.type == 'Cluster' && !ctx.currentCluster) {
            ctx.currentCluster = ctx.item
            ctx.editCluster = ctx.item
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
                ctx.type = 'loading'
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
        mainCtx.item,
        mainCtx.currentCluster,
        mainCtx.type,
        mainCtx.url,
    ])

    const [searchCtx, updateSearchCtx] = React.useReducer<
        updateStateType<Interfaces.SearchContextInterface>
    >(updateState, {
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
                                value={{ mainCtx, updateMainCtx }}
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
