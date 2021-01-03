import * as React from 'react'
import { ApolloProvider } from '@apollo/client'
import CssBaseline from '@material-ui/core/CssBaseline'
import Paper from '@material-ui/core/Paper'
import ActionBar from '../components/ActionBar'
import HeaderBar from '../components/HeaderBar'
import { useStylesAndTheme } from '../theme'
import { elements } from '../editors'
import { loadConfigSync, updateConfigReducer } from '../utils/config'
import { createClient } from '../utils/graphql'
import {
    ConfigInterface,
    MainContextInterface,
    SearchContextInterface,
    ElementEntryInterface,
    ConfigInputInterface,
} from '../interfaces'
import {
    MainContext,
    SearchContext,
    ConfigContext,
    ActiveUrlContext,
} from '../contexts'
import SideBar from '../components/SideBar'
import { CapturingSuspense } from '../components/misc'
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
    const { defaultPath } = props
    const { classes, theme } = useStylesAndTheme()
    const [drawerOpen, setDrawerOpen] = React.useState(true)
    const [config, updateConfig] = React.useReducer(
        updateConfigReducer,
        null,
        () => loadConfigSync()
    )
    const [mainCtx, updateMainCtx] = React.useReducer(updateState, {
        action: config ? 'add' : 'start',
        state: 'default',
        title: null,
        item: null,
        url: null,
        type: elements.keys().next().value,
        shareUrl: null,
    }) as [
        MainContextInterface,
        (update: Partial<MainContextInterface>) => void
    ]
    const [searchCtx, updateSearchCtx] = React.useReducer(updateState, {
        cluster: null,
        include: [],
        exclude: [],
    }) as [
        SearchContextInterface,
        (update: Partial<SearchContextInterface>) => void
    ]
    const [activeUrl, updateActiveUrl] = React.useState(
        () => (config ? config.baseUrl : defaultPath) as string
    )
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
                ) as ElementEntryInterface
            }
            const FrameElementType = (FrameElementWrapper as ElementEntryInterface)
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
    return (
        <ApolloProvider client={createClient(activeUrl)}>
            <ActiveUrlContext.Provider value={{ activeUrl, updateActiveUrl }}>
                <MainContext.Provider value={{ mainCtx, updateMainCtx }}>
                    <SearchContext.Provider
                        value={{ searchCtx, updateSearchCtx }}
                    >
                        <ConfigContext.Provider
                            value={{ config, updateConfig }}
                        >
                            <CssBaseline />
                            <div
                                className={
                                    config && drawerOpen
                                        ? classes.rootShifted
                                        : classes.root
                                }
                            >
                                <SideBar
                                    openState={{ drawerOpen, setDrawerOpen }}
                                />
                                <HeaderBar
                                    openState={{
                                        drawerOpen: !!(drawerOpen && config),
                                        setDrawerOpen,
                                    }}
                                />
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
                        </ConfigContext.Provider>
                    </SearchContext.Provider>
                </MainContext.Provider>
            </ActiveUrlContext.Provider>
        </ApolloProvider>
    )
}

export default MainPage
