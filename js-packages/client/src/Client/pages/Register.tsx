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
import { Field, Formik } from 'formik'
import * as React from 'react'

import FormikTextField from '../components/formik/FormikTextField'
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

function Register() {
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

    return (
        <Formik
            onSubmit={async ({ url }, { setSubmitting }) => {
                setOldConfig(config)
                url = new URL(url, window.location.href).href
                try {
                    const client = createClient(url)
                    const result: any = await client.query({
                        query: serverConfigQuery,
                    })
                    if (!result) {
                        return
                    }
                    const sconfig = result.data.secretgraph.config
                    const hashAlgos = findWorkingHashAlgorithms(
                        sconfig.hashAlgorithms
                    )
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
                            baseUrl: url,
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
                        setSubmitting(false)
                    }
                } catch (errors) {
                    console.error(errors)
                    updateConfig(oldConfig, true)
                    sendMessage({
                        severity: 'error',
                        message: 'error while registration',
                    })
                    // in success case unmounted so this would be a noop
                    // because state is forgotten
                    setSubmitting(false)
                }
            }}
            initialValues={{ url: defaultPath }}
        >
            {({ submitForm, isSubmitting, isValid }) => {
                return (
                    <>
                        <Typography
                            variant="h5"
                            color="textPrimary"
                            gutterBottom
                            paragraph
                        >
                            {initializeHelp}
                        </Typography>
                        <Field
                            component={FormikTextField}
                            disabled={isSubmitting}
                            fullWidth
                            variant="outlined"
                            label="Provider"
                        />
                        <div>
                            <LoadingButton
                                size="small"
                                variant="contained"
                                color="secondary"
                                onClick={submitForm}
                                disabled={isSubmitting || !isValid}
                                loading={isSubmitting}
                            >
                                {initializeLabel}
                            </LoadingButton>
                            <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                disabled={isSubmitting || !isValid}
                                onClick={() => {
                                    updateMainCtx({ action: 'login' })
                                }}
                            >
                                "Register instead"
                            </Button>
                        </div>
                    </>
                )
            }}
        </Formik>
    )
}

export default Register
