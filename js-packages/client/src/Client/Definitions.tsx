import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { validActions } from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    authInfoFromConfig,
    loadConfigSync,
    updateConfigReducer,
} from '@secretgraph/misc/utils/config'
import { createClient } from '@secretgraph/misc/utils/graphql'
import * as React from 'react'

import * as Contexts from './contexts'
import { elements } from './editors'
import Main from './pages/Main'
import { theme as themeDefinition } from './theme'

type Props = {
    defaultPath?: string
    homeUrl?: string
    config?: Interfaces.ConfigInterface | null
}

function updateState<T>(state: T, update: Partial<T>): T {
    return Object.assign({}, state, update)
}
type updateStateType<T> = (state: T, update: Partial<T>) => T

function Definitions({ defaultPath, homeUrl, config: initialConfig }: Props) {
    const searchInit = new URLSearchParams(window.location.hash.substring(1))
    const [openSidebar, _setOpenSidebar] = React.useState(() => {
        return JSON.parse(sessionStorage.getItem('openSidebar') || 'true')
    })
    const [openConfigShare, setOpenConfigShare] = React.useState(false)
    function setOpenSidebar(arg: boolean) {
        sessionStorage.setItem('openSidebar', JSON.stringify(arg))
        _setOpenSidebar(arg)
    }
    const [config, updateConfigIntern] = React.useReducer(
        updateConfigReducer,
        initialConfig || null
    )
    const updateConfig = (
        update: Interfaces.ConfigInputInterface | null,
        replace?: boolean
    ) => updateConfigIntern({ update, replace })
    const [mainCtx, updateMainCtx] = React.useReducer<
        updateStateType<Interfaces.MainContextInterface>, URLSearchParams
    >(updateState, searchInit, (query)=> {
        const ctx: Interfaces.MainContextInterface = {
            action: validActions.has(query.get("action") as any) ? query.get("action") as any: config ? 'create' : 'initialize',
            title: '',
            item: query.get("item"),
            updateId: null,
            url: query.get("url") || null,
            type: elements.has(query.get('type') as any) ? query.get('type') : elements.keys().next().value,
            shareFn: null,
            deleted: null,
            tokens: [],
            tokensPermissions: new Set(),
            cluster: null,
        }
        /*if(config){
            const require = new Set(ctx.action == "create" ? ["manage"] : ctx.action == "update" ? ["manage", "update"] : ['view', 'update', 'manage'])
            const authinfo = authInfoFromConfig({
                config,
                url: ctx.url || config.baseUrl,
                contents: ctx.type == "Cluster" || !ctx.item ? undefined : new Set([ctx.item]),
                clusters: ctx.type != "Cluster" || !ctx.item ? undefined : new Set([ctx.item]),
                require: require
            })
            ctx.tokens = authinfo.tokens
            ctx.tokensPermissions = require
        }
        if(ctx.type == "Cluster" && ctx.item){
            ctx.cluster = ctx.item
        }*/
        return ctx
    })
    const [activeUrl, setActiveUrl] = React.useState(
        () => (config ? config.baseUrl : defaultPath) as string
    )
    React.useEffect(()=> {
        const search = new URLSearchParams()
        search.set("action", mainCtx.action)
        if(mainCtx.action == "create" && mainCtx.type){
            search.set("type", mainCtx.type)
        } else if(mainCtx.item){
            search.set("item", mainCtx.item)
        }
        if(mainCtx.url){
            search.set("url", mainCtx.url)

        }
        window.location.hash = search.toString()

    },[mainCtx.action, mainCtx.item, mainCtx.type, mainCtx.url])

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
    }, [config ? config.baseUrl : ''])

    return (
        <Contexts.External.Provider
            value={{ defaultPath: defaultPath ?? '/graphql', homeUrl }}
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
