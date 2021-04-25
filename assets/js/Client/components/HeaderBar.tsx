import { ApolloClient, useApolloClient } from '@apollo/client'
import AppBar from '@material-ui/core/AppBar'
import Button from '@material-ui/core/Button'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogTitle from '@material-ui/core/DialogTitle'
import FormControl from '@material-ui/core/FormControl'
import FormHelperText from '@material-ui/core/FormHelperText'
import IconButton from '@material-ui/core/IconButton'
import Link from '@material-ui/core/Link'
import Menu from '@material-ui/core/Menu'
import MenuItem from '@material-ui/core/MenuItem'
import TextField from '@material-ui/core/TextField'
import Toolbar from '@material-ui/core/Toolbar'
import Typography from '@material-ui/core/Typography'
import AccountCircle from '@material-ui/icons/AccountCircle'
import MenuIcon from '@material-ui/icons/Menu'
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'
import { encryptingPasswordHelp, encryptingPasswordLabel } from '../messages'
import { serverConfigQuery } from '../queries/server'
import { useStylesAndTheme } from '../theme'
import { exportConfig, exportConfigAsUrl } from '../utils/config'

const menuRef: React.RefObject<any> = React.createRef()

export default function HeaderBar() {
    const { open, setOpen } = React.useContext(Contexts.OpenSidebar)
    const { classes, theme } = useStylesAndTheme()
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
        case 'start':
            title = 'Secretgraph - Start'
            documenttitle = title
            break
        case 'import':
            title = 'Secretgraph - Import'
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
        const encryptingPw = (document.getElementById(
            'secretgraph-export-pw'
        ) as HTMLInputElement).value
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
        const encryptingPw = (document.getElementById(
            'secretgraph-export-pw'
        ) as HTMLInputElement | undefined)?.value
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

    const openImporter = () => {
        setMenuOpen(false)
        updateMainCtx({
            action: 'import',
        })
    }

    let sidebarButton = null
    if (!open && config) {
        sidebarButton = (
            <IconButton
                edge="start"
                className={classes.sidebarButton}
                onClick={() => setOpen(true)}
                color="inherit"
                aria-label="menu"
            >
                <MenuIcon />
            </IconButton>
        )
    }

    React.useLayoutEffect(() => {
        document.title = documenttitle || ''
    }, [documenttitle])

    return (
        <AppBar position="sticky" className={classes.appBar}>
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
            <Toolbar className={classes.appBarToolBar}>
                {sidebarButton}
                <Typography
                    variant="h6"
                    title={mainCtx.item || undefined}
                    className={classes.appBarTitle}
                >
                    {title}
                </Typography>
                <IconButton
                    edge="start"
                    className={classes.userButton}
                    color="inherit"
                    aria-label="user"
                    ref={menuRef}
                    onClick={() => setMenuOpen(true)}
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
                        className={!config ? classes.hidden : undefined}
                        onClick={() => setMenuOpen(false)}
                    >
                        Update Settings
                    </MenuItem>
                    <MenuItem
                        className={!config ? classes.hidden : undefined}
                        onClick={openImporter}
                    >
                        Load Settings
                    </MenuItem>
                    <MenuItem
                        className={!config ? classes.hidden : undefined}
                        onClick={exportSettingsOpener}
                    >
                        Export Settings
                    </MenuItem>
                    <MenuItem onClick={() => setMenuOpen(false)}>Help</MenuItem>
                </Menu>
            </Toolbar>
        </AppBar>
    )
}
