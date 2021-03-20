import { ApolloProvider } from '@apollo/client'
import CssBaseline from '@material-ui/core/CssBaseline'
import Paper from '@material-ui/core/Paper'
import * as React from 'react'

import ActionBar from '../components/ActionBar'
import HeaderBar from '../components/HeaderBar'
import { CapturingSuspense } from '../components/misc'
import SideBar from '../components/SideBar'
import * as Contexts from '../contexts'
import { elements } from '../editors'
import * as Interfaces from '../interfaces'
import { useStylesAndTheme } from '../theme'
import { loadConfigSync, updateConfigReducer } from '../utils/config'
import { createClient } from '../utils/graphql'

// const SideBar = React.lazy(() => import('../components/SideBar'));
const SettingsImporter = React.lazy(() => import('./SettingsImporter'))
const Help = React.lazy(() => import('./Help'))

type Props = {
    defaultPath?: string
}

function updateState<T>(state: T, update: Partial<T>): T {
    return Object.assign({}, state, update)
}

function MainPage(props: Props) {
    const query = new URLSearchParams(document.location.search)
    const { defaultPath } = props
    const { classes, theme } = useStylesAndTheme()
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
        categories: new Set('notifications'),
    }) as [
        Interfaces.SearchContextInterface,
        (update: Partial<Interfaces.SearchContextInterface>) => void
    ]
    const [activeUrl, updateActiveUrl] = React.useState(
        () => (config ? config.baseUrl : defaultPath) as string
    )
    const frameElement = React.useMemo(() => {
        let frameElement = null
        switch (mainCtx.action) {
            case 'view':
            case 'add':
            case 'edit':
                let FrameElementWrapper = elements.get(
                    mainCtx.type ? mainCtx.type : 'undefined'
                )
                if (!FrameElementWrapper) {
                    FrameElementWrapper = elements.get(
                        'undefined'
                    ) as Interfaces.ElementEntryInterface
                }
                const FrameElementType = (FrameElementWrapper as Interfaces.ElementEntryInterface)
                    .component
                if (activeUrl == mainCtx.url || !mainCtx.url) {
                    frameElement = (
                        <CapturingSuspense>
                            <FrameElementType />
                        </CapturingSuspense>
                    )
                } else {
                    frameElement = (
                        <ApolloProvider
                            client={createClient(mainCtx.url as string)}
                        >
                            <CapturingSuspense>
                                <FrameElementType />
                            </CapturingSuspense>
                        </ApolloProvider>
                    )
                }
                break
            case 'start':
            case 'import':
                frameElement = (
                    <CapturingSuspense>
                        <SettingsImporter />
                    </CapturingSuspense>
                )
                break
            case 'help':
                frameElement = (
                    <CapturingSuspense>
                        <Help />
                    </CapturingSuspense>
                )
                break
        }
        return frameElement
    }, [mainCtx.action, mainCtx.url, mainCtx.type])
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
                                <div
                                    className={
                                        config && open
                                            ? classes.rootShifted
                                            : classes.root
                                    }
                                >
                                    <SideBar />
                                    <HeaderBar />
                                    <div className={classes.content}>
                                        <ActionBar />
                                        <Paper
                                            component="main"
                                            className={classes.mainSection}
                                        >
                                            {frameElement}
                                        </Paper>
                                    </div>
                                </div>
                            </Contexts.Config.Provider>
                        </Contexts.Search.Provider>
                    </Contexts.Main.Provider>
                </Contexts.ActiveUrl.Provider>
            </ApolloProvider>
        </Contexts.OpenSidebar.Provider>
    )
}

export default MainPage
