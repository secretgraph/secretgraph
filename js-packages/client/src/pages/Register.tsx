import { ApolloQueryResult } from '@apollo/client'
import LoadingButton from '@mui/lab/LoadingButton'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import {
    serverConfigQuery,
    serverLogout,
} from '@secretgraph/graphql-queries/server'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { deriveClientPW } from '@secretgraph/misc/utils/encryption'
import { createClient } from '@secretgraph/misc/utils/graphql'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/hashing'
import { updateContent } from '@secretgraph/misc/utils/operations'
import { initializeCluster } from '@secretgraph/misc/utils/operations/cluster'
import { exportConfigAsUrl } from '@secretgraph/misc/utils/operations/config'
import { Field, Form, Formik } from 'formik'
import * as React from 'react'

import FormikCheckboxWithLabel from '../components/formik/FormikCheckboxWithLabel'
import FormikTextField from '../components/formik/FormikTextField'
import * as Contexts from '../contexts'
import {
    initializeHelp,
    registerClusterLabel,
    registerUserLabel,
} from '../messages'

function Register() {
    const theme = useTheme()
    const [refreshHandle, notify] = React.useReducer((state) => !state, false)
    const [registerContext, setRegisterContext] = React.useState<
        | {
              registerUrl?: string
              loginUrl?: string
              canDirectRegister: boolean
              activeUser?: string
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
    React.useEffect(() => {
        if (!registerContext?.loginUrl) {
            return
        }
        window.addEventListener('message', (event) => {
            if (event.data == 'login') {
                notify()
            }
        })
        return () => {
            window.removeEventListener('message', notify)
        }
    }, [!!registerContext?.loginUrl])

    return (
        <Formik
            onSubmit={async (
                {
                    url,
                    securityQuestion,
                    lockPW,
                    directRegisterWhenPossible,
                    logoutUserAfterRegistration,
                },
                { setSubmitting }
            ) => {
                setOldConfig(config)
                url = new URL(url, window.location.href).href
                const slot = 'main'
                try {
                    const client = createClient(
                        url,
                        registerContext?.canDirectRegister &&
                            (directRegisterWhenPossible ||
                                !registerContext?.activeUser)
                            ? false
                            : true
                    )
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
                    if (
                        registerContext?.canDirectRegister === true ||
                        registerContext?.activeUser
                    ) {
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
                        if (lockPW) {
                            newConfig['configLockUrl'] =
                                await exportConfigAsUrl({
                                    client,
                                    config: newConfig,
                                    slot: newConfig.slots[0],
                                    pw: lockPW,
                                    types: ['privatekey'],
                                })
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
                        updateConfig(newConfig, true)
                        setActiveUrl(newConfig.baseUrl)
                        updateMainCtx({
                            action: 'create',
                        })
                        if (
                            registerContext.activeUser &&
                            !directRegisterWhenPossible &&
                            logoutUserAfterRegistration
                        ) {
                            try {
                                await client.mutate({ mutation: serverLogout })
                            } catch (exc) {}
                        }
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
                    'The answer to life, the universe and everything',
                    '42',
                ],
                lockPW: '',
                directRegisterWhenPossible: false,
                logoutUserAfterRegistration: true,
            }}
        >
            {({ submitForm, isSubmitting, isValid, values }) => {
                React.useEffect(() => {
                    let active = true
                    const f = async () => {
                        setRegisterContext(undefined)
                        const client = createClient(values.url, true)
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
                                registerUrl: undefined,
                                loginUrl: undefined,
                                canDirectRegister: false,
                                activeUser: undefined,
                                hashAlgorithms: [],
                                errors: ['provider url invalid'],
                            })
                            return
                        }
                        const sconfig = result.data.secretgraph.config
                        const context = {
                            registerUrl: sconfig.registerUrl || undefined,
                            loginUrl: sconfig.loginUrl || undefined,
                            canDirectRegister: sconfig.canDirectRegister,
                            activeUser:
                                result.data.secretgraph.activeUser ||
                                undefined,
                            hashAlgorithms: findWorkingHashAlgorithms(
                                sconfig.hashAlgorithms
                            ),
                            errors: [] as string[],
                        }
                        if (!context.canDirectRegister) {
                            if (!context.loginUrl && !context.activeUser) {
                                context.errors.push('cannot register here')
                            } else if (!context.activeUser) {
                                context.errors.push(
                                    'cannot register cluster, needs to login user first'
                                )
                            }
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
                }, [values.url, refreshHandle])
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

                            <div
                                style={{
                                    display:
                                        !registerContext?.loginUrl &&
                                        !registerContext?.activeUser
                                            ? 'none'
                                            : undefined,
                                }}
                            >
                                <Typography
                                    variant="h5"
                                    color="textPrimary"
                                    gutterBottom
                                    paragraph
                                >
                                    Connect with user
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="textPrimary"
                                    gutterBottom
                                >
                                    Detected user:
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="textPrimary"
                                    gutterBottom
                                >
                                    {registerContext?.activeUser || '-'}
                                </Typography>
                                <div>
                                    <span
                                        style={{
                                            display:
                                                registerContext?.canDirectRegister
                                                    ? undefined
                                                    : 'none',
                                        }}
                                    >
                                        <Field
                                            name="directRegisterWhenPossible"
                                            component={FormikCheckboxWithLabel}
                                            Label={{
                                                label:
                                                    'Register without user?' +
                                                    (!registerContext?.activeUser
                                                        ? ' Note: will register without a user anyway as no user was detected'
                                                        : ''),
                                            }}
                                        />
                                    </span>
                                    <span
                                        style={{
                                            display:
                                                registerContext?.activeUser &&
                                                !values.directRegisterWhenPossible
                                                    ? undefined
                                                    : 'none',
                                        }}
                                    >
                                        <Field
                                            name="logoutUserAfterRegistration"
                                            component={FormikCheckboxWithLabel}
                                            Label={{
                                                label: 'Logout user out after registration? (You are using config instead of user afterwards)',
                                            }}
                                        />
                                    </span>
                                </div>
                                <iframe
                                    style={{
                                        border: '1px solid red',
                                        height: '50vh',
                                        width: '100%',
                                        display:
                                            registerContext?.canDirectRegister &&
                                            values.directRegisterWhenPossible
                                                ? 'none'
                                                : 'block',
                                        paddingTop: theme.spacing(1),
                                    }}
                                    src={registerContext?.loginUrl || ''}
                                ></iframe>
                                <div
                                    style={{
                                        display: registerContext?.registerUrl
                                            ? undefined
                                            : 'none',
                                    }}
                                >
                                    <Link
                                        href={registerContext?.registerUrl}
                                        target="_blank"
                                    >
                                        {registerUserLabel}
                                    </Link>
                                </div>
                            </div>

                            <Stack direction="row" spacing={2}>
                                <LoadingButton
                                    variant="contained"
                                    color="secondary"
                                    onClick={submitForm}
                                    disabled={
                                        !registerContext ||
                                        isSubmitting ||
                                        !isValid ||
                                        !!registerContext?.errors?.length
                                    }
                                    loading={isSubmitting || !registerContext}
                                >
                                    {registerClusterLabel}
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

export default React.memo(Register)
