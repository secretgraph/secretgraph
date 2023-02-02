import { ApolloQueryResult } from '@apollo/client'
import LoadingButton from '@mui/lab/LoadingButton'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { deriveClientPW } from '@secretgraph/misc/utils/encryption'
import { createClient } from '@secretgraph/misc/utils/graphql'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/hashing'
import { initializeCluster } from '@secretgraph/misc/utils/operations/cluster'
import { Field, Form, Formik } from 'formik'
import * as React from 'react'

import FormikTextField from '../components/formik/FormikTextField'
import * as Contexts from '../contexts'
import { initializeHelp, registerLabel } from '../messages'

function Register() {
    const theme = useTheme()
    const [registerContext, setRegisterContext] = React.useState<
        | {
              registerUrl: string | boolean
              hashAlgorithms: string[]
              errors: string[]
          }
        | undefined
    >(undefined)
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
            onSubmit={async ({ url, securityQuestion }, { setSubmitting }) => {
                setOldConfig(config)
                url = new URL(url, window.location.href).href
                const slot = 'main'
                try {
                    const client = createClient(url)
                    const result: any = await client.query({
                        query: serverConfigQuery,
                    })
                    if (!result) {
                        return
                    }
                    if (!registerContext?.hashAlgorithms.length) {
                        sendMessage({
                            severity: 'warning',
                            message: 'unsupported hash algorithms',
                        })
                        return
                    }
                    if (registerContext?.registerUrl === true) {
                        const newConfig: Interfaces.ConfigInterface = {
                            certificates: {},
                            tokens: {},
                            hosts: {},
                            baseUrl: url,
                            configCluster: '',
                            slots: [slot],
                            configSecurityQuestion: [
                                securityQuestion[0],
                                await deriveClientPW({
                                    pw: securityQuestion[1],
                                    hashAlgorithm: 'sha512',
                                    iterations: 1000000,
                                }),
                            ],
                            configLockUrl: '',
                            trustedKeys: {},
                        }
                        newConfig.hosts[newConfig.baseUrl] = {
                            clusters: {},
                            contents: {},
                        }
                        const client = createClient(newConfig.baseUrl)
                        const result = await initializeCluster({
                            client,
                            config: newConfig,
                            hashAlgorithm: registerContext!.hashAlgorithms[0],
                            slot,
                            noteCertificate: 'initial certificate',
                            noteToken: 'initial token',
                        })
                        // TODO: handle exceptions and try with login
                        updateConfig(newConfig, true)
                        setActiveUrl(newConfig.baseUrl)
                        updateMainCtx({
                            action: 'create',
                        })
                    } else {
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
            initialValues={{
                url: defaultPath,
                securityQuestion: [
                    'The answer to life, the universe, and everything',
                    '42',
                ],
            }}
        >
            {({ submitForm, isSubmitting, isValid, values }) => {
                React.useEffect(() => {
                    let active = true
                    const f = async () => {
                        setRegisterContext(undefined)
                        const client = createClient(values.url)
                        let result: ApolloQueryResult<any> | undefined =
                            undefined
                        try {
                            result = await client.query({
                                query: serverConfigQuery,
                            })
                            if (!active) {
                                return
                            }
                        } catch (exc) {
                            console.debug('could not parse url', exc)
                        }
                        if (!result || !result?.data) {
                            setRegisterContext({
                                registerUrl: false,
                                hashAlgorithms: [],
                                errors: ['provider url invalid'],
                            })
                            return
                        }
                        const sconfig = result.data.secretgraph.config
                        const context = {
                            registerUrl: sconfig.registerUrl,
                            hashAlgorithms: findWorkingHashAlgorithms(
                                sconfig.hashAlgorithms
                            ),
                            errors: [] as string[],
                        }
                        if (context.registerUrl === false) {
                            context.errors.push('cannot register here')
                        }
                        if (!context.hashAlgorithms.length) {
                            context.errors.push('no supported hash algorithms')
                        }
                        setRegisterContext(context)
                    }
                    f()
                    return () => {
                        active = false
                    }
                }, [values.url])
                return (
                    <Form>
                        <Typography
                            variant="h5"
                            color="textPrimary"
                            gutterBottom
                            paragraph
                        >
                            {initializeHelp}
                        </Typography>
                        <Stack spacing={1}>
                            <Field
                                name="url"
                                component={FormikTextField}
                                disabled={isSubmitting}
                                fullWidth
                                variant="outlined"
                                label="Provider"
                            />

                            {registerContext?.errors?.length ? (
                                <div style={{ paddingTop: theme.spacing(1) }}>
                                    {registerContext!.errors.map(
                                        (error: string) => (
                                            <Alert severity="error" key={error}>
                                                {error}
                                            </Alert>
                                        )
                                    )}
                                </div>
                            ) : undefined}
                            <Field
                                name="securityQuestion[0]"
                                component={FormikTextField}
                                disabled={isSubmitting}
                                fullWidth
                                variant="outlined"
                                label="Security Question"
                            />
                            <Field
                                name="securityQuestion[1]"
                                component={FormikTextField}
                                disabled={isSubmitting}
                                fullWidth
                                variant="outlined"
                                label="Security Question Answer"
                            />

                            {typeof registerContext?.registerUrl === 'string' &&
                            !registerContext?.errors?.length ? (
                                <div>
                                    <Typography
                                        variant="h5"
                                        color="textPrimary"
                                        gutterBottom
                                        paragraph
                                    >
                                        Manual login required
                                    </Typography>
                                    <iframe
                                        style={{
                                            border: '1px solid red;',
                                            height: '100%',
                                            width: '100%',
                                            display: 'block',
                                            paddingTop: theme.spacing(1),
                                        }}
                                        src={registerContext?.registerUrl}
                                    ></iframe>
                                </div>
                            ) : undefined}

                            <div>
                                <LoadingButton
                                    size="small"
                                    variant="contained"
                                    color="secondary"
                                    onClick={submitForm}
                                    style={{
                                        visibility:
                                            typeof registerContext?.registerUrl ===
                                            'string'
                                                ? 'hidden'
                                                : undefined,
                                    }}
                                    disabled={
                                        !registerContext ||
                                        isSubmitting ||
                                        !isValid ||
                                        !!registerContext?.errors?.length
                                    }
                                    loading={isSubmitting || !registerContext}
                                >
                                    {registerLabel}
                                </LoadingButton>
                                <Button
                                    size="small"
                                    variant="text"
                                    disabled={isSubmitting}
                                    onClick={() => {
                                        updateMainCtx({ action: 'login' })
                                    }}
                                >
                                    Login instead
                                </Button>
                            </div>
                        </Stack>
                    </Form>
                )
            }}
        </Formik>
    )
}

export default Register
