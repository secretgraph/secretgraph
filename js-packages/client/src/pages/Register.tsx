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
import { updateContent } from '@secretgraph/misc/utils/operations'
import { initializeCluster } from '@secretgraph/misc/utils/operations/cluster'
import { exportConfigAsUrl } from '@secretgraph/misc/utils/operations/config'
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
            onSubmit={async (
                { url, securityQuestion, lockPW },
                { setSubmitting }
            ) => {
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
                            configLockQuery: '',
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
                        if (lockPW) {
                            const configUrl = new URL(
                                await exportConfigAsUrl({
                                    client,
                                    config: newConfig,
                                    slot: newConfig.slots[0],
                                    pw: lockPW,
                                    types: ['privatekey'],
                                })
                            )
                            const query = new URLSearchParams(
                                configUrl.searchParams
                            )
                            query.append(
                                'url',
                                configUrl.href.split(/#|\?/, 1)[0]
                            )
                            query.append('action', 'login')

                            newConfig['configLockQuery'] = query.toString()
                            await updateContent({
                                id: result.configResult.content.id,
                                updateId: result.configResult.content.updateId,
                                client,
                                value: new Blob([JSON.stringify(newConfig)]),
                                tags: [
                                    'name=config.json',
                                    `slot=${newConfig.slots[0]}`,
                                ],
                                pubkeys: [result.pubkey],
                                privkeys: [result.signkey],
                                authorization: [
                                    `${result.clusterResult.cluster.id}:${result.manageToken}`,
                                ],
                                hashAlgorithm:
                                    registerContext!.hashAlgorithms[0],
                            })
                        }
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
                lockPW: '',
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
                                            <Alert
                                                severity="error"
                                                key={error}
                                            >
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

                            <Field
                                name="lockPW"
                                component={FormikTextField}
                                disabled={isSubmitting}
                                fullWidth
                                variant="outlined"
                                label="Password used for locking secretgraph on inactivity"
                                helperText="Leave empty to not set an pw"
                            />

                            {typeof registerContext?.registerUrl ===
                                'string' &&
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

                            <Stack direction="row" spacing={2}>
                                <LoadingButton
                                    variant="contained"
                                    color="secondary"
                                    onClick={submitForm}
                                    style={{
                                        minWidth: '15vw',
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
                            </Stack>
                        </Stack>
                    </Form>
                )
            }}
        </Formik>
    )
}

export default Register
