import { ApolloProvider } from '@apollo/client'
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
import { createClient } from '../utils/graphql'

// const SideBar = React.lazy(() => import('../components/SideBar'));
const SettingsImporter = React.lazy(() => import('./SettingsImporter'))
const Help = React.lazy(() => import('./Help'))

function MainPage() {
    const { classes } = useStylesAndTheme()
    const { config } = React.useContext(Contexts.Config)
    const { mainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { open: openSidebar } = React.useContext(Contexts.OpenSidebar)
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
        <div
            className={
                config && openSidebar ? classes.rootShifted : classes.root
            }
        >
            <SideBar />
            <HeaderBar />
            <div className={classes.content}>
                <ActionBar />
                <Paper component="main" className={classes.mainSection}>
                    {frameElement}
                </Paper>
            </div>
        </div>
    )
}

export default MainPage
