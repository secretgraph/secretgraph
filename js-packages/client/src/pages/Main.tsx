import { ApolloProvider } from '@apollo/client'
import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import { useTheme } from '@mui/material/styles'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

import ActionBar from '../components/ActionBar'
import HeaderBar from '../components/HeaderBar'
import { CapturingSuspense } from '../components/misc'
import * as Contexts from '../contexts'
import { elements } from '../editors'
import { drawerWidth } from '../theme'

// const SideBar = React.lazy(() => import('../components/SideBar'));
const Login = React.lazy(() => import('./Login'))
const Register = React.lazy(() => import('./Register'))
const SideBar = React.lazy(() => import('../components/SideBar'))
const Help = React.lazy(() => import('./Help'))

function MainPage() {
    const theme = useTheme()
    const { config } = React.useContext(Contexts.Config)
    const { mainCtx } = React.useContext(Contexts.Main)
    const { message, sendMessage } = React.useContext(Contexts.Snackbar)
    const { navClient, itemClient } = React.useContext(Contexts.Clients)
    const { open: openSidebar } = React.useContext(Contexts.OpenSidebar)
    const [frameElement, hasSidebar] = React.useMemo(() => {
        let FrameElement = null
        let hasSidebar = true
        switch (mainCtx.action) {
            case 'view':
            case 'create':
            case 'update':
                let FrameElementWrapper = elements.get(
                    mainCtx.type ? mainCtx.type : 'undefined'
                )
                if (!FrameElementWrapper) {
                    FrameElementWrapper = elements.get(
                        'undefined'
                    ) as Interfaces.ElementEntryInterface
                }
                FrameElement = (
                    FrameElementWrapper as Interfaces.ElementEntryInterface
                ).component

                break
            case 'login':
                FrameElement = Login
                hasSidebar = false
                break
            case 'register':
                FrameElement = Register
                hasSidebar = false
                break
            case 'help':
                FrameElement = Help
                hasSidebar = false
                break
        }
        return [
            <CapturingSuspense>
                <FrameElement />
            </CapturingSuspense>,
            hasSidebar,
        ]
    }, [mainCtx.action, mainCtx.url, mainCtx.type])
    return (
        <div
            style={{
                height: '100vh',
                display: 'grid',
                grid: `
                    'sidebar header' min-content
                    'sidebar content' 1fr
                    / ${
                        config && openSidebar && hasSidebar ? drawerWidth : 0
                    } 1fr
                    `,
            }}
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
            {hasSidebar ? (
                <ApolloProvider client={navClient}>
                    <SideBar />
                </ApolloProvider>
            ) : null}
            <HeaderBar />
            <div
                style={{
                    gridArea: 'content',
                    display: 'flex' as const,
                    flexDirection: 'column' as const,
                    padding: theme.spacing(1),
                    transition: theme.transitions.create(['margin', 'width'], {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.leavingScreen,
                    }),
                    overflowY: 'auto' as const,
                }}
            >
                <ApolloProvider client={itemClient}>
                    <ActionBar />
                    <Paper
                        component="main"
                        style={{
                            minHeight: '200px' as const,
                            flexGrow: 1,
                            padding: theme.spacing(1),
                            overflowY: 'auto' as const,
                        }}
                    >
                        {frameElement}
                    </Paper>
                </ApolloProvider>
            </div>
        </div>
    )
}

export default React.memo(MainPage)
