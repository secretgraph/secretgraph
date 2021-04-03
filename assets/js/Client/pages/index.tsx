import { ApolloProvider } from '@apollo/client'
import CssBaseline from '@material-ui/core/CssBaseline'
import { ThemeProvider } from '@material-ui/core/styles'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'
import * as Interfaces from '../interfaces'
import { theme as themeDefinition } from '../theme'
import { loadConfigSync, updateConfigReducer } from '../utils/config'
import { createClient } from '../utils/graphql'
import Main from './Main'

type Props = {
    defaultPath?: string
}

function updateState<T>(state: T, update: Partial<T>): T {
    return Object.assign({}, state, update)
}

function Definitions(props: Props) {
    const query = new URLSearchParams(document.location.search)
    const { defaultPath } = props
    const [openSidebar, _setOpenSidebar] = React.useState(() => {
        return JSON.parse(sessionStorage.getItem('openSidebar') || 'true')
    })
    function setOpenSidebar(arg: boolean) {
        sessionStorage.setItem('openSidebar', JSON.stringify(arg))
        _setOpenSidebar(arg)
    }
    const [config, updateConfig] = React.useReducer(
        updateConfigReducer,
        null,
        () => loadConfigSync()
    )
    const [mainCtx, updateMainCtx] = React.useReducer(updateState, {
        action: config ? 'add' : 'start',
        title: null,
        item: null,
        updateId: null,
        url: null,
        type: elements.has(query.get('type') as any)
            ? query.get('type')
            : elements.keys().next().value,
        shareUrl: null,
        deleted: null,
    }) as [
        Interfaces.MainContextInterface,
        (update: Partial<Interfaces.MainContextInterface>) => void
    ]
    const [searchCtx, updateSearchCtx] = React.useReducer(updateState, {
        cluster: null,
        include: [],
        exclude: [],
        deleted: false,
    }) as [
        Interfaces.SearchContextInterface,
        (update: Partial<Interfaces.SearchContextInterface>) => void
    ]
    const [activeUrl, setActiveUrl] = React.useState(
        () => (config ? config.baseUrl : defaultPath) as string
    )
    const navClient = React.useMemo(() => {
        return createClient(activeUrl)
    }, [activeUrl])
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
        <ThemeProvider theme={themeDefinition}>
            <Contexts.OpenSidebar.Provider
                value={{
                    open: openSidebar,
                    setOpen: setOpenSidebar,
                }}
            >
                <Contexts.Clients.Provider
                    value={{ navClient, itemClient, baseClient: configClient }}
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
                                    <CssBaseline />
                                    <Main />
                                </Contexts.Config.Provider>
                            </Contexts.Search.Provider>
                        </Contexts.Main.Provider>
                    </Contexts.ActiveUrl.Provider>
                </Contexts.Clients.Provider>
            </Contexts.OpenSidebar.Provider>
        </ThemeProvider>
    )
}

export default Definitions
