import LoadingButton from '@mui/lab/LoadingButton'
import Button from '@mui/material/Button'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { saveConfig } from '@secretgraph/misc/utils/config'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/encryption'
import { createClient } from '@secretgraph/misc/utils/graphql'
import { initializeCluster } from '@secretgraph/misc/utils/operations'
import { Field, Formik } from 'formik'
import * as React from 'react'

import FormikTextField from '../components/formik/FormikTextField'
import * as Contexts from '../contexts'
import { initializeHelp, initializeLabel } from '../messages'

function Register() {
    const theme = useTheme()
    const [registerUrl, setRegisterUrl] = React.useState(undefined)
    const { defaultPath } = React.useContext(Contexts.External)
    const [oldConfig, setOldConfig] = React.useState(null) as [
        Interfaces.ConfigInterface | null,
        any
    ]
    const { sendMessage } = React.useContext(Contexts.Snackbar)
    const { updateMainCtx } = React.useContext(Contexts.Main)
    const { setActiveUrl } = React.useContext(Contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(Contexts.Config)

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
                            name="url"
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
                                variant="text"
                                disabled={isSubmitting || !isValid}
                                onClick={() => {
                                    updateMainCtx({ action: 'login' })
                                }}
                            >
                                Login instead
                            </Button>
                        </div>
                    </>
                )
            }}
        </Formik>
    )
}

export default Register
