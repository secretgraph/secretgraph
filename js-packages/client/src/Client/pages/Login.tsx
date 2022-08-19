import CheckIcon from '@mui/icons-material/Check'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import LoadingButton from '@mui/lab/LoadingButton'
import { Box } from '@mui/material'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    checkConfigObject,
    loadConfig,
    saveConfig,
} from '@secretgraph/misc/utils/config'
import { createClient } from '@secretgraph/misc/utils/graphql'
import { Field, Formik } from 'formik'
import * as React from 'react'

import FormikTextField from '../components/formik/FormikTextField'
import * as Contexts from '../contexts'
import {
    decryptingPasswordSettingsHelp,
    importFileLabel,
    importHelp,
    importStartLabel,
    passwordLabel,
} from '../messages'

function Login() {
    const theme = useTheme()
    const [needsPw, setNeedsPw] = React.useState(false)
    const { defaultPath } = React.useContext(Contexts.External)
    const [oldConfig, setOldConfig] = React.useState(null) as [
        Interfaces.ConfigInterface | null,
        any
    ]
    const { sendMessage } = React.useContext(Contexts.Snackbar)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl, setActiveUrl } = React.useContext(Contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(Contexts.Config)

    return (
        <Formik
            onSubmit={async ({ url, password, file }, { setSubmitting }) => {
                setOldConfig(config)
                try {
                    if (!file && !url) {
                        return
                    }
                    const newConfig = await loadConfig(
                        file ? file : url,
                        password ? [password] : undefined
                    )
                    if (!newConfig) {
                        sendMessage({
                            severity: 'error',
                            message: 'Configuration is invalid',
                        })
                        setSubmitting(false)
                        return
                    }
                    const newClient = createClient(newConfig.baseUrl)
                    if (!(await checkConfigObject(newClient, newConfig))) {
                        sendMessage({
                            severity: 'error',
                            message: 'Configuration is invalid (server-side)',
                        })
                        setSubmitting(false)
                        return
                    }
                    saveConfig(newConfig)

                    // const env = createEnvironment(newConfig.baseUrl);
                    updateConfig(newConfig, true)
                    setActiveUrl(newConfig.baseUrl)
                    updateMainCtx({
                        action: 'create',
                    })
                } catch (errors) {
                    console.error(errors)
                    updateConfig(oldConfig, true)
                    sendMessage({
                        severity: 'error',
                        message: 'error while import',
                    })
                    // in success case unmounted so this would be a noop
                    // because state is forgotten
                    setSubmitting(false)
                }
            }}
            initialValues={{
                password: '',
                url: defaultPath,
                file: null,
            }}
            validate={({ password, url, file }) => {
                if (!url && !file) {
                    throw Error('nothing set')
                }
                if (needsPw && !password) {
                    throw Error('password is missing')
                }
            }}
        >
            {({
                submitForm,
                isSubmitting,
                values,
                isValid,
                setFieldTouched,
                setFieldValue,
            }) => {
                React.useEffect(() => {
                    setFieldValue('file', null)
                    setNeedsPw(values.url.includes('prekey'))
                }, [values.url])
                return (
                    <>
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
                                    disabled={isSubmitting}
                                    style={{ display: 'none' }}
                                    type="file"
                                    id="secretgraph-import-file"
                                    aria-describedby="secretgraph-import-file-help"
                                    onChange={async (event) => {
                                        const importFiles: FileList | null =
                                            event.target!.files
                                        try {
                                            if (importFiles) {
                                                setNeedsPw(
                                                    !!JSON.parse(
                                                        await importFiles[0].text()
                                                    ).prekeys
                                                )
                                                setFieldValue(
                                                    'file',
                                                    importFiles[0]
                                                )
                                                setFieldTouched('file', true)
                                            } else {
                                                throw Error()
                                            }
                                        } catch (exc) {
                                            setFieldValue('file', null)
                                        }
                                    }}
                                />
                                <label htmlFor="secretgraph-import-file">
                                    <Button
                                        variant="contained"
                                        component="span"
                                        color="primary"
                                        disabled={isSubmitting}
                                        endIcon={
                                            values.file ? (
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
                                <Field
                                    component={FormikTextField}
                                    disabled={isSubmitting}
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
                            <Field
                                component={FormikTextField}
                                variant="outlined"
                                disabled={isSubmitting}
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
                        <div>
                            <LoadingButton
                                size="small"
                                variant="contained"
                                color="primary"
                                loading={isSubmitting}
                                disabled={isSubmitting || !isValid}
                                onClick={submitForm}
                            >
                                {importStartLabel}
                            </LoadingButton>
                            <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                disabled={isSubmitting || !isValid}
                                onClick={() => {
                                    updateMainCtx({ action: 'register' })
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

export default Login
