import AccountCircle from '@mui/icons-material/AccountCircle'
import HomeIcon from '@mui/icons-material/Home'
import MenuIcon from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useTheme } from '@mui/material/styles'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { findConfigIdQuery } from '@secretgraph/graphql-queries/config'
import { serverLogout } from '@secretgraph/graphql-queries/server'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import { b64tobuffer, utf8decoder } from '@secretgraph/misc/utils/encoding'
import { is_pwa } from '@secretgraph/misc/utils/misc'
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'
import ConfigShareDialog from './share/ConfigShareDialog'

const menuRef: React.RefObject<any> = React.createRef()

export default React.memo(function HeaderBar() {
    const theme = useTheme()
    const { open, setOpen } = React.useContext(Contexts.OpenSidebar)
    const [menuOpen, setMenuOpen] = React.useState(false)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { setLoginUrl } = React.useContext(Contexts.LoginUrl)
    const { config, updateConfig } = React.useContext(Contexts.Config)
    const { homeUrl } = React.useContext(Contexts.External)
    const { baseClient, itemClient, navClient } = React.useContext(
        Contexts.Clients
    )
    let title: string,
        documenttitle: string,
        itemParsed = mainCtx.item
    if (itemParsed) {
        try {
            const rawTxt = utf8decoder.decode(b64tobuffer(itemParsed))
            let [_, tmp] = rawTxt.match(/:(.*)/) as string[]
            itemParsed = tmp
        } catch (exc) {
            itemParsed = `...${itemParsed.slice(-48)}`
        }
    }
    switch (mainCtx.action) {
        case 'create':
            let temp = elements.get(mainCtx.type as string)
            title = `Create: ${temp ? temp.label : 'unknown'}`
            documenttitle = `Secretgraph: ${title}`
            break
        case 'update':
            title = `Update: ${mainCtx.type}: ${
                mainCtx.title ? mainCtx.title : itemParsed
            }`
            documenttitle = `Secretgraph: ${title}`
            break
        case 'help':
            title = `Help: ${mainCtx.type}`
            documenttitle = `Secretgraph: ${title}`
            break
        case 'register':
            title = 'Secretgraph - Register'
            documenttitle = title
            break
        case 'login':
            title = 'Secretgraph - Login'
            documenttitle = title
            break
        case 'view':
            if (mainCtx.title) {
                title = mainCtx.title
            } else {
                if (itemParsed) {
                    title = `${mainCtx.type}: ${itemParsed}`
                } else {
                    title = `${mainCtx.type}: -`
                }
            }
            documenttitle = `Secretgraph: ${title}`
            break
        default:
            throw Error(`Invalid type: ${mainCtx.action}`)
    }

    const openConfig = async () => {
        setMenuOpen(false)
        updateMainCtx({
            action: 'view',
            item: null,
            type: 'Config',
            openDialog: null,
        })
        if (!config) {
            return
        }
        const authInfo = authInfoFromConfig({
            config,
            url: config.baseUrl,
            clusters: new Set([config.configCluster]),
        })

        const { data } = await baseClient.query({
            query: findConfigIdQuery,
            variables: {
                configTags: `slot=${config.slots[0]}`,
                authorization: authInfo.tokens,
                cluster: config.configCluster,
            },
        })
        if (!data) {
            console.info('Error retrieving data')
            return
        }
        const nodes = data.secretgraph.contents.edges
        if (!nodes.length) {
            console.warn('Config not found')
            return
        }
        const node = nodes[0].node

        updateMainCtx({
            item: node.id,
            securityLevel: null,
            securityWarningArmed: true,
            readonly: true,
            cluster: null,
            updateId: node.updateId,
            type: 'Config',
            deleted: false,
            action: 'view',
            url: config.baseUrl,
            shareFn: null,
            openDialog: null,
            title: 'Config',
            tokens: authInfo.tokens,
            tokensPermissions: authInfo.types,
            cloneData: null,
        })
    }
    const sharedLockLogout = () => {
        setMenuOpen(false)

        updateConfig(null, true)
        // type is kept
        updateMainCtx({
            action: 'login',
            readonly: true,
            securityLevel: null,
            securityWarningArmed: true,
            title: '',
            item: null,
            updateId: null,
            url: null,
            shareFn: null,
            deleted: null,
            tokens: [],
            tokensPermissions: new Set(),
        })
        // in case it is in localStorage
        localStorage.removeItem('secretgraphConfig')
        // in case it is in sessionStorage
        sessionStorage.removeItem('secretgraphConfig')
    }

    const logout = async () => {
        sharedLockLogout()
        await baseClient.mutate({ mutation: serverLogout })
        sessionStorage.clear()
        baseClient.resetStore()
        navClient.resetStore()
        itemClient.resetStore()
    }
    const lock = () => {
        sharedLockLogout()
        setLoginUrl(config!.configLockUrl)
    }

    let sidebarButton = null
    if (!open && config) {
        sidebarButton = (
            <IconButton
                onClick={() => setOpen(true)}
                color="inherit"
                aria-label="menu"
                size="large"
            >
                <MenuIcon />
            </IconButton>
        )
    }

    React.useLayoutEffect(() => {
        document.title = documenttitle || ''
    }, [documenttitle])

    return (
        <AppBar
            position="sticky"
            sx={{
                gridArea: 'header',
                transition: theme.transitions.create(['margin', 'width'], {
                    easing: theme.transitions.easing.sharp,
                    duration: theme.transitions.duration.leavingScreen,
                }),
            }}
        >
            <Toolbar>
                {sidebarButton}
                <Typography
                    variant="h6"
                    title={mainCtx.item || undefined}
                    sx={{
                        flexGrow: 1,
                        wordBreak: 'break-all' as const,
                        [theme.breakpoints.up('sm')]: {
                            marginLeft: '2rem',
                        },
                    }}
                >
                    {title}
                </Typography>
                <IconButton
                    edge="start"
                    color="inherit"
                    aria-label="user"
                    ref={menuRef}
                    onClick={() => setMenuOpen(true)}
                    size="large"
                >
                    <AccountCircle />
                </IconButton>
                <Menu
                    anchorEl={menuRef.current}
                    anchorOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                    keepMounted
                    open={menuOpen}
                    onClose={() => setMenuOpen(false)}
                >
                    <MenuItem
                        style={{ display: !config ? 'none' : undefined }}
                        onClick={openConfig}
                    >
                        Settings
                    </MenuItem>
                    <MenuItem onClick={() => setMenuOpen(false)}>
                        Help
                    </MenuItem>
                    <MenuItem
                        style={{
                            display:
                                !config || !config.configLockUrl.length
                                    ? 'none'
                                    : undefined,
                        }}
                        onClick={lock}
                    >
                        Lock
                    </MenuItem>
                    <MenuItem
                        style={{
                            display: !config || is_pwa() ? 'none' : undefined,
                        }}
                        onClick={logout}
                    >
                        Logout
                    </MenuItem>

                    <MenuItem
                        style={{ display: !homeUrl ? 'none' : undefined }}
                        href={homeUrl || ''}
                    >
                        Home
                    </MenuItem>
                </Menu>
            </Toolbar>
        </AppBar>
    )
})
