import { DialogActions, DialogContent } from '@mui/material'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import Box from '@mui/system/Box'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'
import { exportConfig, exportConfigAsUrl } from '@secretgraph/misc/utils/config'
import * as React from 'react'

import * as Contexts from '../../contexts'
import { encryptingPasswordSettingsHelp, passwordLabel } from '../../messages'

export default React.memo(function ConfigShareDialog({
    open,
    closeFn,
}: {
    open: boolean
    closeFn: () => void
}) {
    const [password, setPassword] = React.useState('')
    const [exportUrl, setExportUrl] = React.useState('')
    const [loadingExport, setLoadingExport] = React.useState(false)
    const { config } = React.useContext(Contexts.Config)
    const { baseClient } = React.useContext(Contexts.Clients)
    const deferredPw = React.useDeferredValue(password)
    React.useEffect(() => {
        if (!config || !open) {
            return
        }
        let active = true
        const f = async () => {
            setLoadingExport(true)
            let _exportUrl
            try {
                _exportUrl = await exportConfigAsUrl({
                    client: baseClient,
                    config,
                    pw: password,
                    iterations: 100000,
                    types: ['privatekey'],
                })
                if (active) {
                    setExportUrl(_exportUrl)
                }
            } catch (exc) {
                console.error(exc)
            } finally {
                if (active) {
                    setLoadingExport(false)
                }
            }
        }
        f()
        return () => {
            active = false
        }
    }, [deferredPw, open])

    const exportSettingsFile = async () => {
        if (!config) return
        setLoadingExport(true)
        try {
            await exportConfig(
                config,
                password,
                100000,
                'secretgraph_settings.json'
            )
        } finally {
            closeFn()
            setLoadingExport(false)
        }
    }

    const copySettingsUrl = async () => {
        await navigator.clipboard.writeText(exportUrl)
        closeFn()
    }

    return (
        <Dialog
            open={open}
            onClose={closeFn}
            maxWidth="xl"
            fullWidth
            aria-labelledby="export-dialog-title"
        >
            <DialogTitle id="export-dialog-title">Export</DialogTitle>
            <DialogContent>
                <FormControl>
                    <TextField
                        disabled={loadingExport}
                        fullWidth={true}
                        value={password}
                        onChange={(ev) => setPassword(ev.target.value)}
                        variant="outlined"
                        label={passwordLabel}
                        inputProps={{
                            'aria-describedby': 'secretgraph-export-pw-help',
                            autoComplete: 'new-password',
                        }}
                        type="password"
                    />
                    <FormHelperText id="secretgraph-export-pw-help">
                        {encryptingPasswordSettingsHelp}
                    </FormHelperText>
                </FormControl>
                <div
                    style={{
                        visibility: loadingExport ? 'hidden' : 'visible',
                    }}
                >
                    <div>
                        <Link
                            href={exportUrl}
                            sx={{ wordBreak: 'break-all' }}
                            onClick={copySettingsUrl}
                        >
                            {exportUrl}
                        </Link>
                    </div>
                    <div></div>
                </div>
            </DialogContent>
            <DialogActions>
                <Button onClick={closeFn} color="secondary">
                    Close
                </Button>
                <Button
                    disabled={loadingExport}
                    onClick={() => {
                        copySettingsUrl()
                        closeFn()
                    }}
                    color="primary"
                >
                    Export as url
                </Button>
                <Button onClick={exportSettingsFile} color="primary">
                    Export as file
                </Button>
            </DialogActions>
        </Dialog>
    )
})
