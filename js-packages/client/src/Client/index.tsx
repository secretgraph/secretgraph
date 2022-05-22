import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import {AdapterDateFns} from '@mui/x-date-pickers/AdapterDateFns'
import {LocalizationProvider} from '@mui/x-date-pickers/LocalizationProvider'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
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
}

function updateState<T>(state: T, update: Partial<T>): T {
    return Object.assign({}, state, update)
}
type updateStateType<T> = (state: T, update: Partial<T>) => T

function Definitions({ defaultPath, homeUrl }: Props) {
    const query = new URLSearchParams(document.location.search)
    const [openSidebar, _setOpenSidebar] = React.useState(() => {
        return JSON.parse(sessionStorage.getItem('openSidebar') || 'true')
    })
    function setOpenSidebar(arg: boolean) {
        sessionStorage.setItem('openSidebar', JSON.stringify(arg))
        _setOpenSidebar(arg)
    }
    const [config, updateConfigIntern] = React.useReducer(
        updateConfigReducer,
        null,
        () => loadConfigSync()
    )
    const updateConfig = (
        update: Interfaces.ConfigInputInterface | null,
        replace?: boolean
    ) => updateConfigIntern({ update, replace })
    const [mainCtx, updateMainCtx] = React.useReducer<
        updateStateType<Interfaces.MainContextInterface>
    >(updateState, {
        action: config ? 'create' : 'initialize',
        title: '',
        item: null,
        updateId: null,
        url: null,
        type: elements.has(query.get('type') as any)
            ? query.get('type')
            : elements.keys().next().value,
        shareFn: null,
        deleted: null,
        tokens: [],
        tokensPermissions: new Set(),
        cluster: null,
    })
    const [searchCtx, updateSearchCtx] = React.useReducer<
        updateStateType<Interfaces.SearchContextInterface>
    >(updateState, {
        cluster: null,
        include: [],
        exclude: [],
        deleted: false,
    })
    const [activeUrl, setActiveUrl] = React.useState(
        () => (config ? config.baseUrl : defaultPath) as string
    )
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
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                <ThemeProvider theme={themeDefinition}>
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
                                        value={{ searchCtx, updateSearchCtx }}
                                    >
                                        <Contexts.Config.Provider
                                            value={{ config, updateConfig }}
                                        >
                                            <Contexts.Snackbar.Provider
                                                value={{ message, sendMessage }}
                                            >
                                                <CssBaseline />
                                                <Main />
                                            </Contexts.Snackbar.Provider>
                                        </Contexts.Config.Provider>
                                    </Contexts.Search.Provider>
                                </Contexts.Main.Provider>
                            </Contexts.ActiveUrl.Provider>
                        </Contexts.Clients.Provider>
                    </Contexts.OpenSidebar.Provider>
                </ThemeProvider>
            </LocalizationProvider>
        </Contexts.External.Provider>
    )
}

export default React.memo(Definitions)
