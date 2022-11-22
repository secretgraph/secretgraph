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
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'
import ConfigShareDialog from './share/ConfigShareDialog'

const menuRef: React.RefObject<any> = React.createRef()

export default React.memo(function HeaderBar() {
    const theme = useTheme()
    const { open, setOpen } = React.useContext(Contexts.OpenSidebar)
    const [menuOpen, setMenuOpen] = React.useState(false)
    const { open: openConfigShare, setOpen: setOpenConfigShare } =
        React.useContext(Contexts.OpenConfigShare)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(Contexts.Config)
    const { homeUrl } = React.useContext(Contexts.External)
    const { baseClient, itemClient, navClient } = React.useContext(
        Contexts.Clients
    )
    let title: string, documenttitle: string
    switch (mainCtx.action) {
        case 'create':
            let temp = elements.get(mainCtx.type as string)
            title = `Create: ${temp ? temp.label : 'unknown'}`
            documenttitle = `Secretgraph: ${title}`
            break
        case 'update':
            title = `Update: ${mainCtx.type}: ${
                mainCtx.title ? mainCtx.title : mainCtx.item
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
                if (mainCtx.item) {
                    title = `...${mainCtx.item.slice(-48)}`
                } else {
                    title = '-'
                }
            }
            documenttitle = `Secretgraph: ${title}`
            break
        default:
            throw Error(`Invalid type: ${mainCtx.action}`)
    }

    const logout = () => {
        setMenuOpen(false)

        updateConfig(null, true)
        // type is kept
        updateMainCtx({
            action: 'login',
            title: '',
            item: null,
            updateId: null,
            url: null,
            shareFn: null,
            deleted: null,
            tokens: [],
            tokensPermissions: new Set(),
        })
        sessionStorage.clear()
        baseClient.resetStore()
        navClient.resetStore()
        itemClient.resetStore()
        localStorage.removeItem('secretgraphConfig')
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
            <ConfigShareDialog
                open={openConfigShare}
                closeFn={() => {
                    setOpenConfigShare(false)
                }}
            />
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
                        onClick={() => setMenuOpen(false)}
                    >
                        Settings
                    </MenuItem>
                    <MenuItem
                        style={{ display: !config ? 'none' : undefined }}
                        onClick={() => {
                            setMenuOpen(false)
                            setOpenConfigShare(true)
                        }}
                    >
                        Export Settings
                    </MenuItem>
                    <MenuItem onClick={() => setMenuOpen(false)}>Help</MenuItem>
                    <MenuItem
                        style={{ display: !config ? 'none' : undefined }}
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