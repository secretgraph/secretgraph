import CheckIcon from '@mui/icons-material/Check'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import LoadingButton from '@mui/lab/LoadingButton'
import { Box } from '@mui/material'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import { useTheme } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    checkConfigObject,
    loadConfig,
    saveConfig,
} from '@secretgraph/misc/utils/config'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/encryption'
import { createClient } from '@secretgraph/misc/utils/graphql'
import { initializeCluster } from '@secretgraph/misc/utils/operations'
import * as React from 'react'

import * as Contexts from '../contexts'
import {
    decryptingPasswordSettingsHelp,
    importFileLabel,
    importHelp,
    importStartLabel,
    initializeHelp,
    initializeLabel,
    passwordLabel,
} from '../messages'

function SettingsImporter() {
    const theme = useTheme()
    const [registerUrl, setRegisterUrl] = React.useState(undefined)
    const [loadingStart, setLoadingStart] = React.useState(false)
    const [loadingImport, setLoadingImport] = React.useState(false)
    const [needsPw, setNeedsPw] = React.useState(false)
    const [decryptingPw, setPw] = React.useState('')
    const [importUrl, setImportUrl] = React.useState('')
    const { defaultPath } = React.useContext(Contexts.External)
    const [providerUrl, setProviderUrl] = React.useState(defaultPath)
    const [oldConfig, setOldConfig] = React.useState(null) as [
        Interfaces.ConfigInterface | null,
        any
    ]
    const [loginUrl, setLoginUrl] = React.useState(undefined)
    const [hasFile, setHasFile] = React.useState(false)
    const { sendMessage } = React.useContext(Contexts.Snackbar)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl, setActiveUrl } = React.useContext(Contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(Contexts.Config)
    const registerDialogTitleId = React.useId()
    const loginDialogTitleId = React.useId()

    const secretgraphImportFile = React.useRef<HTMLInputElement>()

    function checkIsSubmittable() {
        return (
            (importUrl || secretgraphImportFile.current?.files) &&
            (!needsPw || decryptingPw)
        )
    }

    const handleSecretgraphEvent_inner = async (event: any) => {
        let newConfig: Interfaces.ConfigInterface | null = null
        const client = createClient(providerUrl)
        if (!client) {
            setLoadingImport(false)
            return
        }
        const result = await client.query({ query: serverConfigQuery })
        if (!result) {
            setLoadingImport(false)
            return
        }
        const sconfig = result.data.secretgraph.config
        const hashAlgos = []
        for (const algo of sconfig.hashAlgorithms) {
            const mappedName = Constants.mapHashNames[algo]
            if (mappedName) {
                hashAlgos.push(mappedName.operationName)
            }
        }
        if (!hashAlgos) {
            sendMessage({
                severity: 'warning',
                message: 'unsupported hash algorithm',
            })
            setLoadingImport(false)
            return
        }
        if (event.pingCreate) {
            newConfig = {
                certificates: {},
                tokens: {},
                hosts: {},
                baseUrl: new URL(providerUrl, window.location.href).href,
                configCluster: '',
            }
            newConfig.hosts[newConfig.baseUrl] = {
                clusters: {},
                contents: {},
            }
            await initializeCluster({
                client,
                config: newConfig,
                hashAlgorithm: hashAlgos[0],
            })
        }
        if (!newConfig) {
            setLoadingImport(false)
            return
        }
        updateConfig(newConfig, true)
        setRegisterUrl(undefined)
        setActiveUrl(newConfig.baseUrl)
        updateMainCtx({
            action: 'create',
        })
    }

    const handleSecretgraphEvent = async (event: any) => {
        setOldConfig(config)
        setLoadingStart(true)
        try {
            await handleSecretgraphEvent_inner(event)
        } catch (errors) {
            console.error(errors)
            updateConfig(oldConfig, true)
            sendMessage({
                severity: 'error',
                message: 'error while registration',
            })
            // in success case unmounted so this would be a noop
            // because state is forgotten
            setLoadingImport(false)
        }
    }

    const handleStart_inner = async () => {
        const client = createClient(providerUrl)
        const result: any = await client.query({ query: serverConfigQuery })
        if (!result) {
            return
        }
        const sconfig = result.data.secretgraph.config
        const hashAlgos = findWorkingHashAlgorithms(sconfig.hashAlgorithms)
        if (!hashAlgos.length) {
            sendMessage({
                severity: 'warning',
                message: 'unsupported hash algorithm',
            })
            return
        }
        if (sconfig.registerUrl === true) {
            const newConfig: Interfaces.ConfigInterface = {
                certificates: {},
                tokens: {},
                hosts: {},
                baseUrl: new URL(providerUrl, window.location.href).href,
                configCluster: '',
            }
            newConfig.hosts[newConfig.baseUrl] = {
                clusters: {},
                contents: {},
            }
            const client = createClient(newConfig.baseUrl)
            const result = await initializeCluster({
                client,
                config: newConfig,
                hashAlgorithm: hashAlgos[0],
            })
            // TODO: handle exceptions and try with login
            setRegisterUrl(undefined)
            saveConfig(newConfig)
            updateConfig(newConfig, true)
            setActiveUrl(newConfig.baseUrl)
            updateMainCtx({
                action: 'create',
            })
        } else if (typeof sconfig.registerUrl === 'string') {
            setRegisterUrl(sconfig.registerUrl)
        } else {
            sendMessage({
                severity: 'warning',
                message: 'cannot register here',
            })
        }
    }
    const handleStart = async () => {
        setOldConfig(config)
        setLoadingStart(true)
        try {
            await handleStart_inner()
        } catch (errors) {
            console.error(errors)
            updateConfig(oldConfig, true)
            sendMessage({
                severity: 'error',
                message: 'error while registration',
            })
            // in success case unmounted so this would be a noop
            // because state is forgotten
            setLoadingStart(false)
        }
    }

    const handleImport_inner = async () => {
        const importFiles: FileList | null =
            secretgraphImportFile.current!.files
        if (!importFiles && !importUrl) {
            return
        }
        const newConfig = await loadConfig(
            hasFile && importFiles ? importFiles[0] : importUrl,
            decryptingPw ? [decryptingPw] : undefined
        )
        if (!newConfig) {
            sendMessage({
                severity: 'error',
                message: 'Configuration is invalid',
            })
            setLoadingImport(false)
            return
        }
        const newClient = createClient(newConfig.baseUrl)
        if (!(await checkConfigObject(newClient, newConfig))) {
            sendMessage({
                severity: 'error',
                message: 'Configuration is invalid (server-side)',
            })
            setLoadingImport(false)
            return
        }
        saveConfig(newConfig)

        // const env = createEnvironment(newConfig.baseUrl);
        updateConfig(newConfig, true)
        setActiveUrl(newConfig.baseUrl)
        updateMainCtx({
            action: 'create',
        })
    }
    const handleImport = async () => {
        setOldConfig(config)
        setLoadingImport(true)
        try {
            await handleImport_inner()
        } catch (errors) {
            console.error(errors)
            updateConfig(oldConfig, true)
            sendMessage({ severity: 'error', message: 'error while import' })
            // in success case unmounted so this would be a noop
            // because state is forgotten
            setLoadingImport(false)
        }
    }

    React.useEffect(() => {
        document.addEventListener(
            'secretgraph' as const,
            handleSecretgraphEvent
        )
        return () =>
            document.removeEventListener(
                'secretgraph' as const,
                handleSecretgraphEvent
            )
    })

    return (
        <React.Fragment>
            <Dialog
                open={registerUrl ? true : false}
                onClose={() => loadingStart && setRegisterUrl(undefined)}
                aria-labelledby={registerDialogTitleId}
            >
                <DialogTitle id={registerDialogTitleId}>Register</DialogTitle>
                <DialogContent>
                    <iframe src={registerUrl} />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setRegisterUrl(undefined)}
                        color="secondary"
                        disabled={loadingStart}
                    >
                        Close
                    </Button>
                    <LoadingButton
                        onClick={handleStart}
                        color="primary"
                        disabled={loadingStart || loadingImport}
                        loading={loadingStart}
                    >
                        Retry
                    </LoadingButton>
                </DialogActions>
            </Dialog>
            <Dialog
                open={loginUrl ? true : false}
                onClose={() => loadingImport && setLoginUrl(undefined)}
                aria-labelledby={loginDialogTitleId}
            >
                <DialogTitle id={loginDialogTitleId}>Login</DialogTitle>
                <DialogContent>
                    <iframe src={loginUrl} />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setLoginUrl(undefined)}
                        color="secondary"
                        disabled={loadingImport}
                    >
                        Close
                    </Button>
                    <LoadingButton
                        onClick={handleImport}
                        color="primary"
                        disabled={loadingStart || loadingImport}
                        loading={loadingImport}
                    >
                        Retry
                    </LoadingButton>
                </DialogActions>
            </Dialog>
            <Card>
                <CardContent>
                    <Card>
                        <CardContent>
                            <Typography
                                variant="h5"
                                color="textPrimary"
                                gutterBottom
                                paragraph
                            >
                                {initializeHelp}
                            </Typography>
                            <TextField
                                disabled={loadingStart || loadingImport}
                                fullWidth
                                variant="outlined"
                                value={providerUrl}
                                label="Provider"
                                onChange={(ev) => {
                                    setProviderUrl(ev.target.value)
                                }}
                            />
                        </CardContent>
                        <CardActions>
                            <LoadingButton
                                size="small"
                                variant="contained"
                                color="secondary"
                                onClick={handleStart}
                                disabled={loadingStart || loadingImport}
                                loading={loadingStart}
                            >
                                {initializeLabel}
                            </LoadingButton>
                        </CardActions>
                    </Card>
                </CardContent>
            </Card>
            <Card>
                <CardContent>
                    <Typography
                        variant="h5"
                        color="textPrimary"
                        gutterBottom
                        paragraph
                    >
                        {importHelp}
                    </Typography>
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'row' as const,
                            alignItems: 'stretch',
                        }}
                    >
                        <FormControl
                            sx={{
                                padding: theme.spacing(0, 1),
                                textAlign: 'center' as const,
                            }}
                        >
                            <input
                                disabled={loadingStart || loadingImport}
                                style={{ display: 'none' }}
                                type="file"
                                id="secretgraph-import-file"
                                ref={secretgraphImportFile as any}
                                aria-describedby="secretgraph-import-file-help"
                                onChange={async () => {
                                    const importFiles: FileList | null =
                                        secretgraphImportFile.current!.files
                                    try {
                                        if (importFiles) {
                                            setNeedsPw(
                                                !!JSON.parse(
                                                    await importFiles[0].text()
                                                ).prekeys
                                            )
                                            setHasFile(true)
                                        } else {
                                            throw Error()
                                        }
                                    } catch (exc) {
                                        setHasFile(false)
                                    }
                                }}
                            />
                            <label htmlFor="secretgraph-import-file">
                                <Button
                                    variant="contained"
                                    component="span"
                                    color="primary"
                                    disabled={loadingStart || loadingImport}
                                    endIcon={
                                        hasFile ? (
                                            <CheckIcon />
                                        ) : (
                                            <SystemUpdateAltIcon />
                                        )
                                    }
                                >
                                    Import from File
                                </Button>
                            </label>
                            <FormHelperText id="secretgraph-import-file-help">
                                {importFileLabel}
                            </FormHelperText>
                        </FormControl>
                        <Box
                            sx={{
                                padding: theme.spacing(0, 1),
                                textAlign: 'center',
                            }}
                        >
                            or
                        </Box>
                        <FormControl
                            sx={{
                                flexGrow: 1,
                                padding: theme.spacing(0, 1),
                            }}
                        >
                            <TextField
                                disabled={loadingStart || loadingImport}
                                value={importUrl}
                                onChange={(event) => {
                                    setHasFile(
                                        event.target.value ? false : true
                                    )
                                    setNeedsPw(
                                        event.target.value.includes('prekey')
                                    )
                                    setImportUrl(event.target.value)
                                }}
                                fullWidth={true}
                                variant="outlined"
                                size="small"
                                placeholder="Import from url"
                            />
                            <FormHelperText id="secretgraph-import-url-help">
                                Import from url
                            </FormHelperText>
                        </FormControl>
                    </Box>
                    <FormControl
                        style={{ display: needsPw ? undefined : 'none' }}
                    >
                        <div style={{ display: 'none' }}>
                            <input type="password" tabIndex={-1} />
                        </div>
                        <TextField
                            variant="outlined"
                            disabled={loadingStart || loadingImport}
                            onChange={(event) => {
                                setPw(event.target.value)
                            }}
                            value={decryptingPw}
                            label={passwordLabel}
                            id="secretgraph-decrypting"
                            inputProps={{
                                'aria-describedby':
                                    'secretgraph-decrypting-help',
                            }}
                            type="password"
                        />
                        <FormHelperText id="secretgraph-decrypting-help">
                            {decryptingPasswordSettingsHelp}
                        </FormHelperText>
                    </FormControl>
                </CardContent>
                <CardActions>
                    <LoadingButton
                        size="small"
                        variant="contained"
                        color="primary"
                        loading={loadingImport}
                        disabled={
                            loadingStart ||
                            loadingImport ||
                            !checkIsSubmittable()
                        }
                        onClick={handleImport}
                    >
                        {importStartLabel}
                    </LoadingButton>
                </CardActions>
            </Card>
        </React.Fragment>
    )
}

export default SettingsImporter
