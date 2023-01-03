import {
    validActions,
    validNotLoggedInActions,
} from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    authInfoFromConfig,
    updateConfigReducer,
} from '@secretgraph/misc/utils/config'
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
    return Object.assign({}, state, update)
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
    const [openConfigShare, setOpenConfigShare] = React.useState(false)
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
    const [loginUrl, setLoginUrl] = React.useState('')
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
        const ctx: Interfaces.MainContextInterface = {
            action,
            title: '',
            securityLevel: null,
            securityWarningActive: true,
            readonly: true,
            item: query.get('item'),
            updateId: null,
            url: query.get('url') || activeUrl,
            type: query.get('type') || 'Cluster',
            shareFn: null,
            deleted: null,
            tokens: [],
            tokensPermissions: new Set(),
            cluster: null,
            cloneData: null,
        }
        if (ctx.action == 'clone' && window.opener?.cloneData) {
            ctx.action = 'create'
            ctx.cloneData = window.opener!.cloneData
        }
        if (!config && ctx.action == 'login') {
            if (query.has('prekey') || query.has('token') || query.has('key')) {
                const loginQuery = new URLSearchParams(query)
                loginQuery.delete('url')
                loginQuery.delete('action')
                setLoginUrl(`${ctx.url}?${loginQuery}`)
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
        if (mainCtx.url) {
            search.set('url', mainCtx.url)
        }
        window.location.hash = search.toString()
    }, [mainCtx.action, mainCtx.item, mainCtx.type, mainCtx.url])

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
                loginUrl,
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
                                    <Contexts.OpenConfigShare.Provider
                                        value={{
                                            open: openConfigShare,
                                            setOpen: setOpenConfigShare,
                                        }}
                                    >
                                        <Contexts.Snackbar.Provider
                                            value={{
                                                message,
                                                sendMessage,
                                            }}
                                        >
                                            <Main />
                                        </Contexts.Snackbar.Provider>
                                    </Contexts.OpenConfigShare.Provider>
                                </Contexts.Config.Provider>
                            </Contexts.Search.Provider>
                        </Contexts.Main.Provider>
                    </Contexts.ActiveUrl.Provider>
                </Contexts.Clients.Provider>
            </Contexts.OpenSidebar.Provider>
        </Contexts.External.Provider>
    )
}

export default React.memo(Definitions)
