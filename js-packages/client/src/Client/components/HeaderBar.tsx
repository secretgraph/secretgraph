import { ApolloClient, useApolloClient } from '@apollo/client'
import AccountCircle from '@mui/icons-material/AccountCircle'
import MenuIcon from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useTheme } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'
import { exportConfig, exportConfigAsUrl } from '@secretgraph/misc/utils/config'
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'
import { encryptingPasswordHelp, encryptingPasswordLabel } from '../messages'

const menuRef: React.RefObject<any> = React.createRef()

export default function HeaderBar() {
    const { open, setOpen } = React.useContext(Contexts.OpenSidebar)
    const theme = useTheme()
    const [menuOpen, setMenuOpen] = React.useState(false)
    const [exportOpen, setExportOpen] = React.useState(false)
    const [exportUrl, setExportUrl] = React.useState('')
    const [loadingExport, setLoadingExport] = React.useState(false)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(Contexts.Config)
    const { baseClient: client } = React.useContext(Contexts.Clients)
    let title: string, documenttitle: string
    switch (mainCtx.action) {
        case 'add':
            let temp = elements.get(mainCtx.type as string)
            title = `Add: ${temp ? temp.label : 'unknown'}`
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
        case 'initialize':
            title = 'Secretgraph - Init'
            documenttitle = title
            break
        case 'view':
            if (mainCtx.title) {
                title = mainCtx.title
            } else {
                if (mainCtx.item) {
                    title = `...${mainCtx.item.substr(-48)}`
                } else {
                    title = '-'
                }
            }
            documenttitle = `Secretgraph: ${title}`
            break
        default:
            throw Error(`Invalid type: ${mainCtx.action}`)
    }

    const exportSettingsFile = async () => {
        if (!config) return
        setLoadingExport(true)
        const encryptingPw = (
            document.getElementById('secretgraph-export-pw') as HTMLInputElement
        ).value
        const sconfig: any = await client
            .query({
                query: serverConfigQuery,
            })
            .then((obj: any) => obj.data.secretgraph.config)
            .catch(() => setLoadingExport(false))
        if (!sconfig) {
            setLoadingExport(false)
            return
        }
        exportConfig(config, encryptingPw, 100000, 'secretgraph_settings.json')
        setExportOpen(false)
        setLoadingExport(false)
    }

    const exportSettingsUrl = async () => {
        await navigator.clipboard.writeText(exportUrl)
        setExportOpen(false)
    }

    const exportSettingsOpener = async () => {
        if (!config) return
        const encryptingPw = (
            document.getElementById('secretgraph-export-pw') as
                | HTMLInputElement
                | undefined
        )?.value
        let _exportUrl
        try {
            _exportUrl = await exportConfigAsUrl({
                client,
                config,
                pw: encryptingPw,
                iterations: 100000,
            })
        } catch (exc) {
            console.error(exc)
        }

        setExportUrl(_exportUrl ? (_exportUrl as string) : '')
        setMenuOpen(false)
        setExportOpen(true)
        //const qr = qrcode(typeNumber, errorCorrectionLevel);
    }

    const logout = () => {
        setMenuOpen(false)

        updateConfig(null, true)
        // type is kept
        updateMainCtx({
            action: 'initialize',
            title: '',
            item: null,
            updateId: null,
            url: null,
            shareUrl: null,
            deleted: null,
            tokens: [],
            tokensPermissions: new Set(),
        })
        sessionStorage.clear()
        localStorage.removeItem('secretgraphConfig')
    }

    let sidebarButton = null
    if (!open && config) {
        sidebarButton = (
            <IconButton
                edge="start"
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
            <Dialog
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                aria-labelledby="export-dialog-title"
            >
                <DialogTitle id="export-dialog-title">Export</DialogTitle>
                <DialogContent>
                    <FormControl>
                        <TextField
                            disabled={loadingExport}
                            fullWidth={true}
                            variant="outlined"
                            label={encryptingPasswordLabel}
                            id="secretgraph-export-pw"
                            inputProps={{
                                'aria-describedby':
                                    'secretgraph-export-pw-help',
                                autoComplete: 'new-password',
                            }}
                            type="password"
                        />
                        <FormHelperText id="secretgraph-export-pw-help">
                            {encryptingPasswordHelp}
                        </FormHelperText>
                    </FormControl>
                    <Link href={exportUrl} onClick={exportSettingsUrl}>
                        {exportUrl}
                    </Link>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setExportOpen(false)}
                        color="secondary"
                        disabled={loadingExport}
                    >
                        Close
                    </Button>
                    <Button
                        onClick={exportSettingsUrl}
                        color="primary"
                        disabled={loadingExport}
                    >
                        Export as url
                    </Button>
                    <Button
                        onClick={exportSettingsFile}
                        color="primary"
                        disabled={loadingExport}
                    >
                        Export as file
                    </Button>
                </DialogActions>
            </Dialog>
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
                        onClick={exportSettingsOpener}
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
                </Menu>
            </Toolbar>
        </AppBar>
    )
}
