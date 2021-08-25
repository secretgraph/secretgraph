import { Box } from '@material-ui/core'
import Button from '@material-ui/core/Button'
import Card from '@material-ui/core/Card'
import CardActions from '@material-ui/core/CardActions'
import CardContent from '@material-ui/core/CardContent'
import CircularProgress from '@material-ui/core/CircularProgress'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogTitle from '@material-ui/core/DialogTitle'
import FormControl from '@material-ui/core/FormControl'
import FormHelperText from '@material-ui/core/FormHelperText'
import Snackbar from '@material-ui/core/Snackbar'
import { useTheme } from '@material-ui/core/styles'
import TextField from '@material-ui/core/TextField'
import Typography from '@material-ui/core/Typography'
import CheckIcon from '@material-ui/icons/Check'
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { serverConfigQuery } from '@secretgraph/misc/queries/server'
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
    decryptingPasswordHelp,
    decryptingPasswordLabel,
    importFileLabel,
    importHelp,
    importStartLabel,
    startHelp,
    startLabel,
} from '../messages'

// TODO: use formik
function checkInputs(needsPw: boolean, hasPw: boolean) {
    return (
        (document.getElementById('secretgraph-import-url') as HTMLInputElement)
            ?.value ||
        ((
            document.getElementById(
                'secretgraph-import-file'
            ) as HTMLInputElement
        )?.files &&
            (!needsPw || hasPw))
    )
}

function SettingsImporter() {
    const theme = useTheme()
    const [registerUrl, setRegisterUrl] = React.useState(undefined)
    const [loadingStart, setLoadingStart] = React.useState(false)
    const [loadingImport, setLoadingImport] = React.useState(false)
    const [needsPw, setNeedsPw] = React.useState(false)
    const [hasPw, setHasPw] = React.useState(false)
    const [oldConfig, setOldConfig] = React.useState(null) as [
        Interfaces.ConfigInterface | null,
        any
    ]
    const [loginUrl, setLoginUrl] = React.useState(undefined)
    const [hasFile, setHasFile] = React.useState(false)
    const mainElement = document.getElementById('content-main')
    const defaultPath: string | undefined = mainElement
        ? mainElement.dataset.graphqlPath
        : undefined
    const { sendMessage } = React.useContext(Contexts.Snackbar)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl, setActiveUrl } = React.useContext(Contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(Contexts.Config)

    const handleSecretgraphEvent_inner = async (event: any) => {
        const providerUrl = (
            document.getElementById('secretgraph-provider') as HTMLInputElement
        ).value
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
            await initializeCluster(client, newConfig, hashAlgos[0])
        }
        if (!newConfig) {
            setLoadingImport(false)
            return
        }
        updateConfig(newConfig, true)
        setRegisterUrl(undefined)
        setActiveUrl(newConfig.baseUrl)
        updateMainCtx({
            action: 'add',
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
        const providerUrl: string = (
            document.getElementById('secretgraph-provider') as HTMLInputElement
        ).value
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
            const result = await initializeCluster(
                client,
                newConfig,
                hashAlgos[0]
            )
            // TODO: handle exceptions and try with login
            setRegisterUrl(undefined)
            saveConfig(newConfig)
            updateConfig(newConfig, true)
            setActiveUrl(newConfig.baseUrl)
            updateMainCtx({
                action: 'add',
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
        const decryptingPw = (
            document.getElementById(
                'secretgraph-decrypting'
            ) as HTMLInputElement
        ).value
        const importFiles: FileList | null = (
            document.getElementById(
                'secretgraph-import-file'
            ) as HTMLInputElement
        ).files
        const importUrl: string = (
            document.getElementById(
                'secretgraph-import-url'
            ) as HTMLInputElement
        ).value
        if (!importFiles && !importUrl) {
            return
        }
        const newConfig = await loadConfig(
            hasFile && importFiles ? importFiles[0] : importUrl,
            decryptingPw ? [decryptingPw] : undefined
        )
        if (!newConfig) {
            /**if (importUrl && !importFiles){

        return;
      } else {*/
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
            action: 'add',
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
                aria-labelledby="register-dialog-title"
            >
                <DialogTitle id="register-dialog-title">Register</DialogTitle>
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
                    <Button
                        onClick={handleStart}
                        color="primary"
                        disabled={loadingStart || loadingImport}
                    >
                        Retry
                        {loadingStart && (
                            <CircularProgress
                                size={24}
                                className={theme.classes.buttonProgress}
                            />
                        )}
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog
                open={loginUrl ? true : false}
                onClose={() => loadingImport && setLoginUrl(undefined)}
                aria-labelledby="login-dialog-title"
            >
                <DialogTitle id="login-dialog-title">Login</DialogTitle>
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
                    <Button
                        onClick={handleImport}
                        color="primary"
                        disabled={loadingStart || loadingImport}
                    >
                        Retry
                        {loadingImport && (
                            <CircularProgress
                                size={24}
                                className={theme.classes.buttonProgress}
                            />
                        )}
                    </Button>
                </DialogActions>
            </Dialog>
            <Card>
                <CardContent>
                    <Card raised={mainCtx.action === 'start'}>
                        <CardContent>
                            <Typography
                                variant="h5"
                                color="textPrimary"
                                gutterBottom
                                paragraph
                            >
                                {startHelp}
                            </Typography>
                            <TextField
                                disabled={loadingStart || loadingImport}
                                fullWidth
                                variant="outlined"
                                defaultValue={defaultPath}
                                label="Provider"
                                id="secretgraph-provider"
                            />
                        </CardContent>
                        <CardActions>
                            <Button
                                size="small"
                                variant="contained"
                                color="secondary"
                                onClick={handleStart}
                                disabled={loadingStart || loadingImport}
                            >
                                {startLabel}
                                {loadingStart && (
                                    <CircularProgress
                                        size={24}
                                        className={theme.classes.buttonProgress}
                                    />
                                )}
                            </Button>
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
                    <Box className={theme.classes.import_Wrapper}>
                        <FormControl className={theme.classes.import_Item}>
                            <input
                                disabled={loadingStart || loadingImport}
                                style={{ display: 'none' }}
                                type="file"
                                id="secretgraph-import-file"
                                aria-describedby="secretgraph-import-file-help"
                                onChange={async () => {
                                    ;(
                                        document.getElementById(
                                            'secretgraph-import-url'
                                        ) as HTMLInputElement
                                    ).value = ''
                                    const importFiles: FileList | null = (
                                        document.getElementById(
                                            'secretgraph-import-file'
                                        ) as HTMLInputElement
                                    ).files
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
                        <Box className={theme.classes.import_Item}>or</Box>
                        <FormControl className={theme.classes.import_Url}>
                            <TextField
                                disabled={loadingStart || loadingImport}
                                onChange={(event) => {
                                    setHasFile(
                                        event.target.value ? false : true
                                    )
                                    setNeedsPw(true)
                                }}
                                fullWidth={true}
                                variant="outlined"
                                size="small"
                                placeholder="Import from url"
                                id="secretgraph-import-url"
                            />
                            <FormHelperText id="secretgraph-import-url-help">
                                Import from url
                            </FormHelperText>
                        </FormControl>
                    </Box>
                    <FormControl
                        style={{ display: needsPw ? undefined : 'hidden' }}
                    >
                        <TextField
                            variant="outlined"
                            disabled={loadingStart || loadingImport}
                            onChange={(event) => {
                                setHasPw(event.target.value ? true : false)
                            }}
                            label={decryptingPasswordLabel}
                            id="secretgraph-decrypting"
                            inputProps={{
                                'aria-describedby':
                                    'secretgraph-decrypting-help',
                            }}
                            type="password"
                        />
                        <FormHelperText id="secretgraph-decrypting-help">
                            {decryptingPasswordHelp}
                        </FormHelperText>
                    </FormControl>
                </CardContent>
                <CardActions>
                    <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        disabled={
                            loadingStart ||
                            loadingImport ||
                            !checkInputs(needsPw, hasPw)
                        }
                        onClick={handleImport}
                    >
                        {importStartLabel}
                        {loadingImport && (
                            <CircularProgress
                                size={24}
                                className={theme.classes.buttonProgress}
                            />
                        )}
                    </Button>
                </CardActions>
            </Card>
        </React.Fragment>
    )
}

export default SettingsImporter