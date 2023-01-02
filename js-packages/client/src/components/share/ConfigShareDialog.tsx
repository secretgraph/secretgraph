import { DialogActions, DialogContent } from '@mui/material'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { exportConfig, updateConfig } from '@secretgraph/misc/utils/config'
import {
    createContent,
    updateCluster,
} from '@secretgraph/misc/utils/operations'
import { exportConfigAsUrl } from '@secretgraph/misc/utils/operations/config'
import * as React from 'react'

import * as Contexts from '../../contexts'
import {
    encryptingPasswordSettingsHelp,
    passwordLabel,
    slotSelectionHelp,
} from '../../messages'

export default React.memo(function ConfigShareDialog({
    open,
    closeFn,
}: {
    open: boolean
    closeFn: () => void
}) {
    const { config } = React.useContext(Contexts.Config)
    const [slot, setSlot] = React.useState((config?.slots || [null])[0])
    const [password, setPassword] = React.useState('')
    const [exportUrl, setExportUrl] = React.useState('')
    const [loadingExport, setLoadingExport] = React.useState(false)
    const [typing, setTyping] = React.useState(false)
    const deferredPw = React.useDeferredValue(password)
    const { baseClient } = React.useContext(Contexts.Clients)
    React.useEffect(() => {
        setSlot((config?.slots || [null])[0])
    }, [config])
    React.useEffect(() => {
        if (!config || !open) {
            return
        }
        let active = true
        const f = async () => {
            if (!active || !slot) {
                return
            }
            setTyping(true)
            let _exportUrl
            try {
                _exportUrl = await exportConfigAsUrl({
                    client: baseClient,
                    config,
                    slot,
                    pw: deferredPw,
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
                    setTyping(false)
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
            setLoadingExport(false)
            closeFn()
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
                    <div style={{ display: 'none' }}>
                        <input type="password" tabIndex={-1} />
                    </div>
                    <TextField
                        fullWidth={true}
                        disabled={loadingExport}
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
                <FormControl>
                    <Autocomplete
                        fullWidth={true}
                        disabled={loadingExport}
                        value={slot}
                        onChange={async (ev, value: string | null, reason) => {
                            setSlot(value)
                        }}
                        options={config!.slots}
                        renderInput={(params) => {
                            return (
                                <TextField
                                    {...params}
                                    InputProps={{
                                        'aria-describedby':
                                            'secretgraph-export-slot-help',
                                    }}
                                    label={'Slots'}
                                    fullWidth
                                    variant="outlined"
                                />
                            )
                        }}
                    />
                    <FormHelperText id="secretgraph-export-slot-help">
                        {slotSelectionHelp}
                    </FormHelperText>
                </FormControl>
                <div
                    style={{
                        visibility: typing ? 'hidden' : 'visible',
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
                    disabled={loadingExport || typing}
                    onClick={() => {
                        copySettingsUrl()
                        closeFn()
                    }}
                    color="primary"
                >
                    Export as url
                </Button>
                <Button
                    disabled={loadingExport}
                    onClick={exportSettingsFile}
                    color="primary"
                >
                    Export as file
                </Button>
            </DialogActions>
        </Dialog>
    )
})
