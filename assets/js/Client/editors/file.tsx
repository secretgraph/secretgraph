import * as React from 'react'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import { Autocomplete as FormikAutocomplete } from 'formik-material-ui-lab'
import LinearProgress from '@material-ui/core/LinearProgress'
import * as DOMPurify from 'dompurify'
import Button from '@material-ui/core/Button'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import Typography from '@material-ui/core/Typography'

import Grid from '@material-ui/core/Grid'
import { useAsync } from 'react-async'

import { Formik, FieldProps, Form, FastField, Field } from 'formik'

import { TextField as FormikTextField } from 'formik-material-ui'
import { useApolloClient, ApolloClient, FetchResult } from '@apollo/client'

import { ConfigInterface, MainContextInterface } from '../interfaces'
import * as Constants from '../constants'
import {
    MainContext,
    InitializedConfigContext,
    SearchContext,
    ActiveUrlContext,
} from '../contexts'

import { extractPubKeysCluster } from '../utils/graphql'
import {
    decryptContentId,
    createContent,
    updateContent,
} from '../utils/operations'

import { extractAuthInfo, extractPrivKeys } from '../utils/config'
import { utf8decoder } from '../utils/misc'

import {
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '../queries/content'
import { useStylesAndTheme } from '../theme'
import { newClusterLabel } from '../messages'
import SunEditor from '../components/SunEditor'
import UploadButton from '../components/UploadButton'
import SimpleSelect from '../components/forms/SimpleSelect'
import ClusterSelect from '../components/forms/ClusterSelect'
import DecisionFrame from '../components/DecisionFrame'
import { TextFieldProps as TextFieldPropsFormik } from 'material-ui'

const ViewFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const { config } = React.useContext(InitializedConfigContext)
    const [blobUrl, setBlobUrl] = React.useState<string | undefined>(undefined)
    const client = useApolloClient()

    //
    const { data } = useAsync({
        promiseFn: decryptContentId,
        suspense: true,
        onReject: console.error,
        client: client,
        config: config as ConfigInterface,
        url: mainCtx.url as string,
        id: mainCtx.item as string,
        decryptTags: ['mime', 'name'],
        watch: (mainCtx.url as string) + mainCtx.item,
    })
    if (!data) {
        return null
    }
    const mime =
        data && data.tags.mime && data.tags.mime.length > 0
            ? data.tags.mime[0]
            : 'application/octet-stream'
    React.useEffect(() => {
        if (!data) {
            return
        }
        const updateOb: Partial<MainContextInterface> = {}
        if (data.tags.name && data.tags.name.length > 0) {
            updateOb['title'] = data.tags.name[0]
        }
        if (
            data.tags.state &&
            data.tags.state.length > 0 &&
            Constants.contentStates.has(data.tags.state[0])
        ) {
            updateOb['state'] = data.tags.state[0] as any
        }
        updateMainCtx(updateOb)
        const _blobUrl = URL.createObjectURL(
            new Blob([data.data], { type: mime })
        )
        setBlobUrl(_blobUrl)
        return () => {
            setBlobUrl(undefined)
            URL.revokeObjectURL(_blobUrl)
        }
    }, [data])
    if (!blobUrl || !data) {
        return null
    }
    let inner: null | JSX.Element = null
    switch (mime.split('/', 1)[0]) {
        case 'text':
            let text
            try {
                text = new TextDecoder().decode(data.data)
                // sanitize and render
            } catch (exc) {
                console.error('Could not parse', exc)
                text = `${data.data}`
            }
            if (mime == 'text/html') {
                const sanitized = DOMPurify.sanitize(text)
                inner = (
                    <Grid
                        item
                        xs={12}
                        dangerouslySetInnerHTML={{ __html: sanitized }}
                    />
                )
            } else {
                inner = (
                    <Grid item xs={12}>
                        <pre>{text}</pre>
                    </Grid>
                )
            }
        case 'audio':
        case 'video':
            inner = (
                <Grid item xs={12}>
                    <video controls>
                        <source src={blobUrl} style={{ width: '100%' }} />
                    </video>
                </Grid>
            )
            break
        case 'image':
            inner = (
                <Grid item xs={12}>
                    <a href={blobUrl}>
                        <img
                            src={blobUrl}
                            alt={
                                data.tags.name && data.tags.name.length > 0
                                    ? data.tags.name[0]
                                    : ''
                            }
                            style={{ width: '100%' }}
                        />
                    </a>
                </Grid>
            )
            break
    }
    return (
        <Grid container spacing={2}>
            <Grid item xs={12}>
                <Typography variant="h5">Keywords</Typography>
                <Typography variant="body2">
                    {data.tags.keywords && data.tags.keywords.join(', ')}
                </Typography>
            </Grid>
            {inner}
            <Grid item xs={12}>
                <a href={blobUrl} type={mime} target="_blank">
                    <CloudDownloadIcon />
                </a>
            </Grid>
        </Grid>
    )
}

const AddFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const { activeUrl } = React.useContext(ActiveUrlContext)
    const { searchCtx } = React.useContext(SearchContext)
    const { config } = React.useContext(InitializedConfigContext)
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    const client = useApolloClient()

    return (
        <Formik
            initialValues={{
                plainInput: '',
                htmlInput: '',
                fileInput: null as null | Blob,
                name: '',
                keywords: [] as string[],
                cluster: searchCtx.cluster ? searchCtx.cluster : null,
            }}
            validate={(values) => {
                const errors: Partial<
                    { [key in keyof typeof values]: string }
                > = {}
                if (!values.name) {
                    errors['name'] = 'Name required'
                }
                if (!values.cluster) {
                    errors['cluster'] = 'Cluster required'
                }
                if (
                    (values.plainInput && values.htmlInput) ||
                    (values.plainInput && values.fileInput) ||
                    (values.htmlInput && values.fileInput)
                ) {
                    errors['plainInput'] = errors['htmlInput'] = errors[
                        'fileInput'
                    ] = 'only one can be set'
                } else if (
                    !values.plainInput &&
                    !values.htmlInput &&
                    !values.fileInput
                ) {
                    errors['plainInput'] = errors['htmlInput'] = errors[
                        'fileInput'
                    ] = 'one field must be set'
                }

                return errors
            }}
            onSubmit={async (values, { setSubmitting, setValues }) => {
                let value: Blob
                if (values.htmlInput) {
                    value = new Blob([DOMPurify.sanitize(values.htmlInput)], {
                        type: 'text/html',
                    })
                } else if (values.plainInput) {
                    value = new Blob([values.plainInput], {
                        type: 'text/plain',
                    })
                } else if (values.fileInput) {
                    value = values.fileInput
                } else {
                    throw Error('no input found')
                }
                const authinfo = extractAuthInfo({
                    config,
                    clusters: new Set([values.cluster as string]),
                    url: activeUrl,
                    require: new Set(['update']),
                })
                const pubkeysResult = await client.query({
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.keys,
                        id: values.cluster,
                    },
                })
                const hashAlgorithm = config.hosts[activeUrl].hashAlgorithms[0]
                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url: activeUrl,
                    hashAlgorithm,
                })
                const pubkeys = extractPubKeysCluster({
                    node: pubkeysResult.data.secretgraph.node,
                    authorization: authinfo.keys,
                    params: {
                        name: 'RSA-OAEP',
                        hash: hashAlgorithm,
                    },
                })
                try {
                    const result = await createContent({
                        client,
                        config,
                        cluster: values.cluster as string,
                        value,
                        tags: [
                            `name=${values.name}`,
                            `mime=${value.type}`,
                            `state=${
                                mainCtx.state == 'default'
                                    ? 'internal'
                                    : mainCtx.state
                            }`,
                            `type=${
                                value.type.startsWith('text/') ? 'Text' : 'File'
                            }`,
                        ].concat(
                            values.keywords.map(
                                (val) =>
                                    `keyword=${
                                        (val.match(/=(.*)/) as string[])[1]
                                    }`
                            )
                        ),
                        encryptTags: new Set(['name', 'mime']),
                        privkeys: await Promise.all(Object.values(privkeys)),
                        pubkeys: Object.values(pubkeys),
                        hashAlgorithm,
                        authorization: authinfo.keys,
                    })
                    updateMainCtx({
                        item: result.data.updateOrCreateContent.content.id,
                        url: activeUrl,
                        action: 'edit',
                    })
                } catch (exc) {
                    console.error(exc)
                    setSubmitting(false)
                }
            }}
        >
            {({ submitForm, isSubmitting, values, setValues }) => (
                <Form>
                    <Grid container spacing={1}>
                        <Grid item xs={12} md={4}>
                            <Field
                                component={FormikTextField}
                                name="name"
                                fullWidth
                                label="Name"
                                disabled={isSubmitting}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Field
                                component={SimpleSelect}
                                name="keywords"
                                disabled={isSubmitting}
                                options={[]}
                                label="Keywords"
                                freeSolo
                                multiple
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Field
                                component={ClusterSelect}
                                url={activeUrl as string}
                                name="cluster"
                                disabled={isSubmitting}
                                label="Cluster"
                                firstIfEmpty
                            />
                        </Grid>
                        {mainCtx.type != 'Text' ? (
                            <Grid item xs={12} sm={6}>
                                <Field
                                    component={FormikTextField}
                                    name="plainInput"
                                    label="Text"
                                    fullWidth
                                    variant="outlined"
                                    multiline
                                    disabled={
                                        !!(
                                            isSubmitting ||
                                            values.htmlInput ||
                                            values.fileInput
                                        )
                                    }
                                />
                            </Grid>
                        ) : null}
                        <Grid
                            item
                            xs={12}
                            sm={mainCtx.type != 'Text' ? 6 : undefined}
                        >
                            <Field name="htmlInput">
                                {(formikFieldProps: FieldProps) => {
                                    return (
                                        <SunEditor
                                            value={formikFieldProps.meta.value}
                                            name="htmlInput"
                                            label="Html Text"
                                            variant="outlined"
                                            onChange={(ev) => {
                                                formikFieldProps.form.setValues(
                                                    {
                                                        ...formikFieldProps.form
                                                            .values,
                                                        htmlInput:
                                                            ev.target.value,
                                                    }
                                                )
                                            }}
                                            helperText={
                                                formikFieldProps.meta.error
                                            }
                                            error={
                                                !!formikFieldProps.meta.error &&
                                                !!formikFieldProps.meta.touched
                                            }
                                            disabled={
                                                !!(
                                                    isSubmitting ||
                                                    values.plainInput ||
                                                    values.fileInput
                                                )
                                            }
                                        />
                                    )
                                }}
                            </Field>
                        </Grid>

                        <Grid item xs={12}>
                            <Field
                                name="fileInput"
                                disabled={
                                    !!(
                                        isSubmitting ||
                                        values.plainInput ||
                                        values.htmlInput
                                    )
                                }
                            >
                                {(formikFieldProps: FieldProps) => {
                                    return (
                                        <>
                                            <UploadButton
                                                name="fileInput"
                                                onChange={(ev) => {
                                                    if (
                                                        ev.target.files &&
                                                        ev.target.files.length >
                                                            0
                                                    ) {
                                                        /**setPSelections([
                                                            ev.target.files[0]
                                                                .name,
                                                        ])*/
                                                        if (
                                                            !formikFieldProps
                                                                .form.touched
                                                                .name
                                                        ) {
                                                            formikFieldProps.form.setFieldValue(
                                                                'name',
                                                                ev.target
                                                                    .files[0]
                                                                    .name
                                                            )
                                                        }
                                                        formikFieldProps.form.setFieldValue(
                                                            'fileInput',
                                                            ev.target.files[0]
                                                        )
                                                    } else {
                                                        formikFieldProps.form.setFieldValue(
                                                            'fileInput',
                                                            null
                                                        )
                                                    }
                                                }}
                                                accept={
                                                    mainCtx.type == 'Text'
                                                        ? 'text/*'
                                                        : undefined
                                                }
                                            >
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    component="span"
                                                    disabled={
                                                        !!(
                                                            isSubmitting ||
                                                            values.plainInput ||
                                                            values.htmlInput
                                                        )
                                                    }
                                                >
                                                    Upload
                                                </Button>
                                            </UploadButton>
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                component="span"
                                                disabled={
                                                    !!(
                                                        isSubmitting ||
                                                        values.plainInput ||
                                                        values.htmlInput
                                                    )
                                                }
                                                onClick={() =>
                                                    setValues({
                                                        ...values,
                                                        fileInput: null,
                                                    })
                                                }
                                            >
                                                Clear
                                            </Button>
                                            {formikFieldProps.meta.error && (
                                                <Typography
                                                    color={
                                                        formikFieldProps.meta
                                                            .touched
                                                            ? 'error'
                                                            : undefined
                                                    }
                                                >
                                                    {
                                                        formikFieldProps.meta
                                                            .error
                                                    }
                                                </Typography>
                                            )}
                                        </>
                                    )
                                }}
                            </Field>
                        </Grid>
                        <Grid item xs={12}>
                            {isSubmitting && <LinearProgress />}
                        </Grid>
                        <Grid item xs={12}>
                            <Button
                                variant="contained"
                                color="primary"
                                disabled={isSubmitting}
                                onClick={submitForm}
                            >
                                Submit
                            </Button>
                        </Grid>
                    </Grid>
                </Form>
            )}
        </Formik>
    )
}

const TextFileAdapter = ({
    mime,
    onChange,
    onBlur,
    value,
    ...props
}: {
    mime: string
    onChange: (newText: Blob) => void
    onBlur?: any
    value: Blob
} & Pick<TextFieldProps, 'disabled' | 'error' | 'helperText'>) => {
    if (!mime.startsWith('text/')) {
        return null
    }
    const [text, setText] = React.useState<string | undefined>(undefined)
    React.useEffect(() => {
        value.text().then((val) => setText(val))
        return () => setText(undefined)
    }, [value])
    if (text === undefined) {
        return null
    }
    if (mime === 'text/html') {
        return (
            <SunEditor
                label="Html Text"
                fullWidth
                variant="outlined"
                multiline
                onChange={(ev) => {
                    onChange(new Blob([ev.currentTarget.value], { type: mime }))
                }}
                onBlur={onBlur}
                {...props}
            />
        )
    }
    return (
        <TextField
            fullWidth
            multiline
            variant="outlined"
            label={'Plaintext input'}
            onBlur={onBlur}
            value={text}
            {...props}
            onChange={(ev) => {
                onChange(new Blob([ev.currentTarget.value], { type: mime }))
            }}
        />
    )
}

const EditFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const { config } = React.useContext(InitializedConfigContext)
    const client = useApolloClient()
    const { data } = useAsync({
        promiseFn: decryptContentId,
        onReject: console.error,
        suspense: true,
        client: client,
        config: config as ConfigInterface,
        url: mainCtx.url as string,
        id: mainCtx.item as string,
        decryptTags: ['mime', 'name'],
        watch: (mainCtx.url as string) + mainCtx.item,
    })

    React.useEffect(() => {
        if (!data) {
            return
        }
        const updateOb: Partial<MainContextInterface> = {}
        if (data.tags.name && data.tags.name.length > 0) {
            updateOb['title'] = data.tags.name[0]
        }
        if (
            data.tags.state &&
            data.tags.state.length > 0 &&
            Constants.contentStates.has(data.tags.state[0])
        ) {
            updateOb['state'] = data.tags.state[0] as any
        }
        updateMainCtx(updateOb)
        const _blobUrl = URL.createObjectURL(
            new Blob([data.data], { type: mime })
        )
    }, [data])

    if (!data) {
        return null
    }
    const mime =
        data.tags.mime && data.tags.mime.length > 0
            ? data.tags.mime[0]
            : 'application/octet-stream'

    return (
        <Formik
            initialValues={{
                fileInput: new Blob([data.data], { type: mime }),
                name:
                    data.tags.name && data.tags.name.length > 0
                        ? data.tags.name[0]
                        : '',
                keywords: data.tags.keywords || [],
                cluster: data.nodeData?.cluster?.id as string | null,
            }}
            validate={(values) => {
                const errors: Partial<
                    { [key in keyof typeof values]: string }
                > = {}
                if (!values.name) {
                    errors['name'] = 'Name required'
                }
                if (!values.fileInput) {
                    errors['fileInput'] = 'empty'
                }
                return errors
            }}
            onSubmit={async (values, { setSubmitting, setValues }) => {
                const value: Blob = values.fileInput
                const authinfo = extractAuthInfo({
                    config,
                    clusters: new Set([mainCtx.item as string]),
                    url: mainCtx.url as string,
                    require: new Set(['update']),
                })
                const pubkeysResult = await client.query({
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.keys,
                        id: mainCtx.item,
                    },
                })
                const hashAlgorithm =
                    config.hosts[mainCtx.url as string].hashAlgorithms[0]
                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url: mainCtx.url as string,
                    hashAlgorithm,
                })
                const pubkeys = extractPubKeysCluster({
                    node: pubkeysResult.data.secretgraph.node,
                    authorization: authinfo.keys,
                    params: {
                        name: 'RSA-OAEP',
                        hash: hashAlgorithm,
                    },
                })
                const result = await updateContent({
                    id: mainCtx.item as string,
                    updateId: pubkeysResult.data.secretgraph.node.updateId,
                    client,
                    config,
                    cluster: values.cluster || undefined,
                    value,
                    tags: [
                        `name=${values.name}`,
                        `mime=${value.type}`,
                        `state=${
                            mainCtx.state == 'default'
                                ? 'internal'
                                : mainCtx.state
                        }`,
                        `type=${
                            value.type.startsWith('text/') ? 'Text' : 'File'
                        }`,
                    ].concat(
                        values.keywords.map(
                            (val) =>
                                `keyword=${(val.match(/=(.*)/) as string[])[1]}`
                        )
                    ),
                    encryptTags: new Set(['name', 'mime']),
                    privkeys: await Promise.all(Object.values(privkeys)),
                    pubkeys: Object.values(pubkeys),
                    hashAlgorithm,
                    authorization: authinfo.keys,
                })
                updateMainCtx({
                    item: result.data.updateOrCreateContent.content.id,
                    action: 'edit',
                })
            }}
        >
            {({
                submitForm,
                isSubmitting,
                values,
                setValues,
                touched,
                errors,
            }) => (
                <Grid container spacing={1}>
                    <Grid item xs={12} md={4}>
                        <Field
                            component={FormikTextField}
                            name="name"
                            fullWidth
                            label="Name"
                            disabled={isSubmitting}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Field
                            component={SimpleSelect}
                            name="keywords"
                            disabled={isSubmitting}
                            options={[]}
                            label="Keywords"
                            freeSolo
                            multiple
                        />
                    </Grid>

                    <Grid item xs={12} md={4}>
                        <Field
                            component={ClusterSelect}
                            url={mainCtx.url as string}
                            name="cluster"
                            disabled={isSubmitting}
                            label="Cluster"
                            firstIfEmpty
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextFileAdapter
                            value={values.fileInput}
                            onChange={(blob) => {
                                setValues({
                                    ...values,
                                    fileInput: blob,
                                })
                            }}
                            mime={mime}
                            disabled={isSubmitting}
                            helperText={errors['fileInput']}
                            error={
                                errors['fileInput'] && !!touched['fileInput']
                            }
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <Field name="fileInput" disabled={isSubmitting}>
                            {(formikFieldProps: FieldProps) => {
                                return (
                                    <>
                                        <UploadButton
                                            name="fileInput"
                                            onChange={
                                                formikFieldProps.field.onChange
                                            }
                                            accept={
                                                mainCtx.type == 'Text'
                                                    ? 'text/*'
                                                    : undefined
                                            }
                                        >
                                            <Button disabled={isSubmitting}>
                                                Upload
                                            </Button>
                                        </UploadButton>
                                        {formikFieldProps.meta.error && (
                                            <Typography
                                                color={
                                                    formikFieldProps.meta
                                                        .touched
                                                        ? 'error'
                                                        : undefined
                                                }
                                            >
                                                {formikFieldProps.meta.error}
                                            </Typography>
                                        )}
                                    </>
                                )
                            }}
                        </Field>
                    </Grid>
                    <Grid item xs={12}>
                        {isSubmitting && <LinearProgress />}
                    </Grid>
                    <Grid item xs={12}>
                        <Button
                            variant="contained"
                            color="primary"
                            disabled={isSubmitting}
                            onClick={submitForm}
                        >
                            Submit
                        </Button>
                    </Grid>
                </Grid>
            )}
        </Formik>
    )
}

export default function FileComponent() {
    const { mainCtx } = React.useContext(MainContext)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            add={AddFile}
            view={ViewFile}
            edit={EditFile}
        />
    )
}
