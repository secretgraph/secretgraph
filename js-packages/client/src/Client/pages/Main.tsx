import { ApolloProvider } from '@apollo/client'
import { Box } from '@mui/material'
import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import { useTheme } from '@mui/material/styles'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

import ActionBar from '../components/ActionBar'
import HeaderBar from '../components/HeaderBar'
import { CapturingSuspense } from '../components/misc'
import SideBar from '../components/SideBar'
import * as Contexts from '../contexts'
import { elements } from '../editors'

// const SideBar = React.lazy(() => import('../components/SideBar'));
const SettingsImporter = React.lazy(
    () =>
        import(
            /*webpackChunkName: "main-SettingsImporter" */ './SettingsImporter'
        )
)
const Help = React.lazy(
    () => import(/*webpackChunkName: "main-help" */ './Help')
)

function MainPage() {
    const theme = useTheme()
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
            case 'update':
                let FrameElementWrapper = elements.get(
                    mainCtx.type ? mainCtx.type : 'undefined'
                )
                if (!FrameElementWrapper) {
                    FrameElementWrapper = elements.get(
                        'undefined'
                    ) as Interfaces.ElementEntryInterface
                }
                const FrameElementType = (
                    FrameElementWrapper as Interfaces.ElementEntryInterface
                ).component
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
        <Box
            className={
                config && openSidebar
                    ? theme.classes.rootShifted
                    : theme.classes.root
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
            <Box className={theme.classes.content}>
                <ApolloProvider client={itemClient}>
                    <ActionBar />
                    <Paper
                        component="main"
                        className={theme.classes.mainSection}
                    >
                        {frameElement}
                    </Paper>
                </ApolloProvider>
            </Box>
        </Box>
    )
}

export default React.memo(MainPage)
