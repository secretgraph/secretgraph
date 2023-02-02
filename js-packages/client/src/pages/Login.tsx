import CheckIcon from '@mui/icons-material/Check'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import LoadingButton from '@mui/lab/LoadingButton'
import { Box } from '@mui/material'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { loadConfig } from '@secretgraph/misc/utils/config'
import { createClient } from '@secretgraph/misc/utils/graphql'
import {
    checkConfigObject,
    updateConfigRemoteReducer,
} from '@secretgraph/misc/utils/operations'
import { Field, Form, Formik } from 'formik'
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
    const [needsPw, setNeedsPw] = React.useState(false)
    const [oldConfig, setOldConfig] = React.useState(null) as [
        Interfaces.ConfigInterface | null,
        any
    ]
    const { loginUrl } = React.useContext(Contexts.External)
    const { sendMessage } = React.useContext(Contexts.Snackbar)
    const { updateMainCtx } = React.useContext(Contexts.Main)
    const { setActiveUrl } = React.useContext(Contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(Contexts.Config)

    return (
        <Formik
            onSubmit={async ({ url, password, file }, { setSubmitting }) => {
                setOldConfig(config)
                try {
                    if (!file && !url) {
                        return
                    }
                    const [newConfig, needsUpdate] = await loadConfig(
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
                    if (needsUpdate) {
                        updateConfigRemoteReducer(null, {
                            update: newConfig,
                            client: newClient,
                        })
                    }
                    if (!(await checkConfigObject(newClient, newConfig))) {
                        sendMessage({
                            severity: 'error',
                            message: 'Configuration is invalid (server-side)',
                        })
                        setSubmitting(false)
                        return
                    }

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
                url: loginUrl,
                file: null,
            }}
            validate={({ password, url, file }) => {
                if (!url && !file) {
                    return {
                        url: 'One of file or url required',
                        file: 'One of file or url required',
                    }
                }
                if (needsPw && !password) {
                    return {
                        password: 'password is missing',
                    }
                }
            }}
        >
            {({
                submitForm,
                isSubmitting,
                values,
                errors,
                touched,
                isValid,
                setFieldTouched,
                setFieldValue,
            }) => {
                React.useEffect(() => {
                    setFieldValue('file', null)
                    setNeedsPw(values.url.includes('prekey'))
                }, [values.url])
                return (
                    <Form>
                        <Stack spacing={2}>
                            <Typography variant="h5" color="textPrimary">
                                {importHelp}
                            </Typography>
                            <Stack
                                direction="row"
                                alignItems="stretch"
                                spacing={1}
                            >
                                <FormControl>
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
                                                    setFieldTouched(
                                                        'file',
                                                        true
                                                    )
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
                                        {errors?.file && touched?.file ? (
                                            <Box
                                                sx={{
                                                    color: (theme) =>
                                                        theme.palette.error
                                                            .main,
                                                }}
                                            >
                                                {errors!.file}
                                            </Box>
                                        ) : null}
                                        {importFileLabel}
                                    </FormHelperText>
                                </FormControl>
                                <Typography textAlign="center">or</Typography>
                                <FormControl
                                    style={{
                                        flexGrow: 1,
                                    }}
                                >
                                    <Field
                                        component={FormikTextField}
                                        name="url"
                                        disabled={isSubmitting}
                                        fullWidth={true}
                                        variant="outlined"
                                        size="small"
                                        placeholder="import url"
                                    />
                                    <FormHelperText id="secretgraph-import-url-help">
                                        Import from url
                                    </FormHelperText>
                                </FormControl>
                            </Stack>
                            {needsPw ? (
                                <FormControl>
                                    <Field
                                        name="password"
                                        component={FormikTextField}
                                        variant="outlined"
                                        autoComplete="on"
                                        disabled={isSubmitting}
                                        label={passwordLabel}
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
                            ) : null}

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
                                    variant="text"
                                    disabled={isSubmitting}
                                    onClick={() => {
                                        updateMainCtx({ action: 'register' })
                                    }}
                                >
                                    Register instead
                                </Button>
                            </div>
                        </Stack>
                    </Form>
                )
            }}
        </Formik>
    )
}

export default Login
