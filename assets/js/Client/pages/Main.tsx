import { ApolloProvider } from '@apollo/client'
import Paper from '@material-ui/core/Paper'
import Snackbar from '@material-ui/core/Snackbar'
import Alert from '@material-ui/lab/Alert'
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
    const { message, sendMessage } = React.useContext(Contexts.Snackbar)
    const { navClient, itemClient } = React.useContext(Contexts.Clients)
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
                frameElement = (
                    <CapturingSuspense>
                        <FrameElementType />
                    </CapturingSuspense>
                )

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
            <Snackbar
                open={message ? true : false}
                autoHideDuration={12000}
                onClose={() => sendMessage(undefined)}
            >
                <Alert
                    onClose={() => sendMessage(undefined)}
                    severity={message ? message.severity : undefined}
                    elevation={6}
                    variant="filled"
                >
                    {message ? message.message : undefined}
                </Alert>
            </Snackbar>
            <ApolloProvider client={navClient}>
                <SideBar />
            </ApolloProvider>
            <HeaderBar />
            <div className={classes.content}>
                <ApolloProvider client={itemClient}>
                    <ActionBar />
                    <Paper component="main" className={classes.mainSection}>
                        {frameElement}
                    </Paper>
                </ApolloProvider>
            </div>
        </div>
    )
}

export default React.memo(MainPage)
