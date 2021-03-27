import { ApolloProvider } from '@apollo/client'
import CssBaseline from '@material-ui/core/CssBaseline'
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'
import * as Interfaces from '../interfaces'
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
    const [openSidebar, updateOpenSidebar] = React.useState(false)
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
    const [activeUrl, updateActiveUrl] = React.useState(
        () => (config ? config.baseUrl : defaultPath) as string
    )
    return (
        <Contexts.OpenSidebar.Provider
            value={{ open: openSidebar, updateOpen: updateOpenSidebar }}
        >
            <ApolloProvider client={createClient(activeUrl)}>
                <Contexts.ActiveUrl.Provider
                    value={{ activeUrl, updateActiveUrl }}
                >
                    <Contexts.Main.Provider value={{ mainCtx, updateMainCtx }}>
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
            </ApolloProvider>
        </Contexts.OpenSidebar.Provider>
    )
}

export default Definitions
