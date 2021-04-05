import { useApolloClient, useQuery } from '@apollo/client'
import Button from '@material-ui/core/Button'
import Checkbox from '@material-ui/core/Checkbox'
import FormControlLabel from '@material-ui/core/FormControlLabel'
import Grid from '@material-ui/core/Grid'
import LinearProgress from '@material-ui/core/LinearProgress'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import Tooltip from '@material-ui/core/Tooltip'
import Typography from '@material-ui/core/Typography'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import * as DOMPurify from 'dompurify'
import { FastField, Field, FieldProps, Form, Formik } from 'formik'
import {
    CheckboxWithLabel as FormikCheckboxWithLabel,
    TextField as FormikTextField,
} from 'formik-material-ui'
import * as React from 'react'
import { useAsync } from 'react-async'

import DecisionFrame from '../components/DecisionFrame'
import ClusterSelect from '../components/forms/ClusterSelect'
import SimpleSelect from '../components/forms/SimpleSelect'
import StateSelect from '../components/forms/StateSelect'
import SunEditor from '../components/SunEditor'
import UploadButton from '../components/UploadButton'
import * as Constants from '../constants'
import * as Contexts from '../contexts'
import * as Interfaces from '../interfaces'
import { contentRetrievalQuery } from '../queries/content'
import { getContentConfigurationQuery } from '../queries/content'
import { useStylesAndTheme } from '../theme'
import { extractAuthInfo, extractPrivKeys } from '../utils/config'
import { extractPubKeysCluster } from '../utils/graphql'
import {
    createContent,
    decryptContentObject,
    updateContent,
} from '../utils/operations'
import { UnpackPromise } from '../utils/typing'

const decryptSet = new Set(['mime', 'ename'])
const ViewWidget = ({
    arrayBuffer,
    mime,
    name,
}: {
    arrayBuffer: Promise<ArrayBuffer>
    mime: string
    name: string
}) => {
    const [blobUrl, setBlobUrl] = React.useState<string | undefined>(undefined)
    const { data: arrBuff } = useAsync({
        promise: arrayBuffer,
        onReject: console.error,
    })
    React.useEffect(() => {
        if (!arrBuff) {
            return
        }
        const _blobUrl = URL.createObjectURL(
            new Blob([arrBuff], { type: mime })
        )
        setBlobUrl(_blobUrl)
        return () => {
            setBlobUrl(undefined)
            URL.revokeObjectURL(_blobUrl)
        }
    }, [arrBuff])
    if (!blobUrl) {
        return null
    }
    let inner: null | JSX.Element = null
    switch (mime.split('/', 1)[0]) {
        case 'text':
            let text
            try {
                text = new TextDecoder().decode(arrBuff)
                // sanitize and render
            } catch (exc) {
                console.error('Could not parse', exc)
                text = `${arrayBuffer}`
            }
            if (mime == 'text/html') {
                const sanitized = DOMPurify.sanitize(text)
                inner = <div dangerouslySetInnerHTML={{ __html: sanitized }} />
            } else {
                inner = <pre>{text}</pre>
            }
            break
        case 'audio':
        case 'video':
            inner = (
                <video controls>
                    <source src={blobUrl} style={{ width: '100%' }} />
                </video>
            )
            break
        case 'image':
            inner = (
                <a href={blobUrl}>
                    <img src={blobUrl} alt={name} style={{ width: '100%' }} />
                </a>
            )
            break
    }
    return (
        <>
            <Grid item xs={12}>
                <Typography variant="h5">Content</Typography>
                {inner}
            </Grid>
            <Grid item xs={12}>
                <a href={blobUrl} type={mime} target="_blank">
                    <CloudDownloadIcon />
                </a>
            </Grid>
        </>
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
    React.useLayoutEffect(() => {
        value.text().then((val) => setText(val))
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
                value={text}
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
            {...props}
            fullWidth
            multiline
            variant="outlined"
            label={'Plaintext input'}
            onBlur={onBlur}
            defaultValue={text}
            onChange={(ev) => {
                onChange(new Blob([ev.currentTarget.value], { type: mime }))
            }}
        />
    )
}

const ViewFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const client = useApolloClient()
    const [data, setData] = React.useState<
        UnpackPromise<ReturnType<typeof decryptContentObject>>
    >(null)

    const { data: dataUnfinished } = useQuery(contentRetrievalQuery, {
        pollInterval: 60000,
        variables: {
            variables: {
                id: mainCtx.item as string,
                authorization: mainCtx.tokens,
            },
        },
    })
    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        decryptContentObject({
            config,
            nodeData: dataUnfinished.secretgraph.node,
            blobOrTokens: mainCtx.tokens,
            decrypt: decryptSet,
        }).then(setData)
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    const mime =
        data.tags.mime && data.tags.mime.length > 0
            ? data.tags.mime[0]
            : 'application/octet-stream'
    const state =
        data.tags.state &&
        data.tags.state.length > 0 &&
        Constants.contentStates.has(data.tags.state[0])
            ? data.tags.state[0]
            : ''

    let name: string = mainCtx.item as string
    let encryptName = false
    if (data.tags.ename && data.tags.ename.length > 0) {
        name = data.tags.ename[0]
        encryptName = true
    } else if (data.tags.name && data.tags.name.length > 0) {
        name = data.tags.name[0]
    }
    return (
        <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
                <Typography variant="h5">Name</Typography>
                <Typography variant="body2">{name}</Typography>
            </Grid>
            <Grid item>
                <Tooltip
                    title={
                        encryptName
                            ? 'Name is encrypted'
                            : 'Name is unencrypted'
                    }
                >
                    <FormControlLabel
                        disabled
                        checked={encryptName}
                        control={<Checkbox />}
                        label="Encrypted"
                    />
                </Tooltip>
            </Grid>
            <Grid item xs={12} md={4}>
                <Typography variant="h5">Keywords</Typography>
                <Typography variant="body2">
                    {data.tags.keywords && data.tags.keywords.join(', ')}
                </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
                <Typography variant="h5">State</Typography>
                <Typography variant="body2">
                    {state
                        ? (Constants.contentStates.get(state) as {
                              label: string
                          }).label
                        : 'unknown'}
                </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
                <Typography variant="h5">Cluster</Typography>
                <Typography variant="body2">
                    {data.nodeData.cluster.id}
                </Typography>
            </Grid>
            <ViewWidget
                arrayBuffer={Promise.resolve(data.data)}
                mime={mime}
                name={name}
            />
        </Grid>
    )
}

const AddFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config } = React.useContext(Contexts.InitializedConfig)
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    const client = useApolloClient()

    return (
        <Formik
            initialValues={{
                plainInput: '',
                htmlInput: '',
                fileInput: null as null | Blob,
                state: 'internal',
                name: '',
                encryptName: true,
                keywords: [] as string[],
                cluster: searchCtx.cluster ? searchCtx.cluster : null,
            }}
            validate={(values) => {
                const errors: Partial<
                    { [key in keyof typeof values]: string }
                > = {}
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
                        authorization: authinfo.tokens,
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
                    authorization: authinfo.tokens,
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
                            values.encryptName
                                ? `ename=${btoa(values.name)}`
                                : `name=${values.name}`,
                            `mime=${btoa(value.type)}`,
                            `state=${values.state}`,
                            `type=${
                                value.type.startsWith('text/') ? 'Text' : 'File'
                            }`,
                        ].concat(
                            values.keywords.map((val) => `keyword=${val}`)
                        ),
                        encryptTags: new Set(['ename', 'mime']),
                        privkeys: await Promise.all(Object.values(privkeys)),
                        pubkeys: Object.values(pubkeys),
                        hashAlgorithm,
                        authorization: authinfo.tokens,
                    })
                    updateMainCtx({
                        item: result.data.updateOrCreateContent.content.id,
                        updateId:
                            result.data.updateOrCreateContent.content.updateId,
                        url: activeUrl,
                        action: 'edit',
                    })
                } catch (exc) {
                    console.error(exc)
                    setSubmitting(false)
                }
            }}
        >
            {({ submitForm, isSubmitting, values, setValues, dirty }) => {
                let preview = null
                if (values.plainInput) {
                    preview = (
                        <ViewWidget
                            arrayBuffer={new Blob([
                                values.plainInput,
                            ]).arrayBuffer()}
                            mime={'text/plain'}
                            name={values.name}
                        />
                    )
                } else if (values.fileInput) {
                    preview = (
                        <ViewWidget
                            arrayBuffer={values.fileInput.arrayBuffer()}
                            mime={
                                values.fileInput.type ||
                                'application/octet-stream'
                            }
                            name={values.name}
                        />
                    )
                } else if (values.htmlInput) {
                    preview = (
                        <ViewWidget
                            arrayBuffer={new Blob([
                                values.htmlInput,
                            ]).arrayBuffer()}
                            mime={'text/html'}
                            name={values.name}
                        />
                    )
                }
                return (
                    <Form>
                        <Grid container spacing={2}>
                            {preview}
                            <Grid item xs={12} sm={10}>
                                <FastField
                                    component={FormikTextField}
                                    name="name"
                                    fullWidth
                                    label="Name"
                                    disabled={isSubmitting}
                                    validate={(val: string) => {
                                        if (!val) {
                                            return 'empty'
                                        }
                                        return null
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={2}>
                                <Tooltip title="Encrypt name">
                                    <span>
                                        <FastField
                                            name="encryptName"
                                            component={FormikCheckboxWithLabel}
                                            Label={{
                                                label: 'Encrypt',
                                            }}
                                            disabled={isSubmitting}
                                            type="checkbox"
                                        />
                                    </span>
                                </Tooltip>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FastField
                                    component={StateSelect}
                                    name="state"
                                    fullWidth
                                    label="State"
                                    disabled={isSubmitting}
                                    validate={(val: string) => {
                                        if (!val) {
                                            return 'empty'
                                        }
                                        return null
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FastField
                                    component={ClusterSelect}
                                    url={activeUrl as string}
                                    name="cluster"
                                    disabled={isSubmitting}
                                    label="Cluster"
                                    firstIfEmpty
                                    validate={(val: string) => {
                                        if (!val) {
                                            return 'empty'
                                        }
                                        return null
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FastField
                                    component={SimpleSelect}
                                    name="keywords"
                                    disabled={isSubmitting}
                                    options={[]}
                                    label="Keywords"
                                    freeSolo
                                    multiple
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
                                                value={
                                                    formikFieldProps.meta.value
                                                }
                                                name="htmlInput"
                                                label="Html Text"
                                                variant="outlined"
                                                onChange={(ev) => {
                                                    formikFieldProps.form.setFieldValue(
                                                        'htmlInput',
                                                        ev.target.value
                                                    )
                                                }}
                                                helperText={
                                                    formikFieldProps.meta.error
                                                }
                                                error={
                                                    !!formikFieldProps.meta
                                                        .error &&
                                                    !!formikFieldProps.meta
                                                        .touched
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
                                                            ev.target.files
                                                                .length > 0
                                                        ) {
                                                            /**setPSelections([
                                                                ev.target.files[0]
                                                                    .name,
                                                            ])*/
                                                            if (
                                                                !formikFieldProps
                                                                    .form
                                                                    .touched
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
                                                                ev.target
                                                                    .files[0]
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
                                                {formikFieldProps.meta
                                                    .error && (
                                                    <Typography
                                                        color={
                                                            formikFieldProps
                                                                .meta.touched
                                                                ? 'error'
                                                                : undefined
                                                        }
                                                    >
                                                        {
                                                            formikFieldProps
                                                                .meta.error
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
                                    disabled={isSubmitting || !dirty}
                                    onClick={submitForm}
                                >
                                    Submit
                                </Button>
                            </Grid>
                        </Grid>
                    </Form>
                )
            }}
        </Formik>
    )
}

const EditFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const client = useApolloClient()
    const [data, setData] = React.useState<
        UnpackPromise<ReturnType<typeof decryptContentObject>>
    >(null)

    const { data: dataUnfinished, refetch } = useQuery(contentRetrievalQuery, {
        variables: {
            variables: {
                id: mainCtx.item as string,
                authorization: mainCtx.tokens,
            },
        },
    })
    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        decryptContentObject({
            config,
            nodeData: dataUnfinished.secretgraph.node,
            blobOrTokens: mainCtx.tokens,
            decrypt: decryptSet,
        }).then(setData)
    }, [dataUnfinished])
    if (!data) {
        return null
    }

    if (!data) {
        return null
    }
    const mime =
        data.tags.mime && data.tags.mime.length > 0
            ? data.tags.mime[0]
            : 'application/octet-stream'
    const state =
        data.tags.state &&
        data.tags.state.length > 0 &&
        Constants.contentStates.has(data.tags.state[0])
            ? data.tags.state[0]
            : 'internal'

    let name: string = mainCtx.item as string
    let encryptName = false
    if (data.tags.ename && data.tags.ename.length > 0) {
        name = data.tags.ename[0]
        encryptName = true
    } else if (data.tags.name && data.tags.name.length > 0) {
        name = data.tags.name[0]
    }
    return (
        <Formik
            initialValues={{
                textFInput: new Blob([data.data], { type: mime }),
                fileInput: new Blob([data.data], { type: mime }),
                name,
                encryptName,
                state,
                keywords: data.tags.keywords || [],
                cluster: data.nodeData?.cluster?.id as string,
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
                    clusters: new Set([
                        values.cluster,
                        data.nodeData.cluster.id,
                    ]),
                    url: mainCtx.url as string,
                    require: new Set(['update']),
                })
                const pubkeysResult = await client.query({
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.tokens,
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
                    node: pubkeysResult.data.secretgraph.node.cluster,
                    authorization: authinfo.tokens,
                    params: {
                        name: 'RSA-OAEP',
                        hash: hashAlgorithm,
                    },
                })
                const result = await updateContent({
                    id: mainCtx.item as string,
                    updateId: data.nodeData.updateId,
                    client,
                    config,
                    cluster: values.cluster, // can be null for keeping cluster
                    value,
                    tags: [
                        values.encryptName
                            ? `ename=${btoa(values.name)}`
                            : `name=${values.name}`,
                        `mime=${btoa(value.type)}`,
                        `state=${values.state}`,
                        `type=${
                            value.type.startsWith('text/') ? 'Text' : 'File'
                        }`,
                    ].concat(values.keywords.map((val) => `keyword=${val}`)),
                    encryptTags: new Set(['ename', 'mime']),
                    privkeys: await Promise.all(Object.values(privkeys)),
                    pubkeys: Object.values(pubkeys),
                    hashAlgorithm,
                    authorization: authinfo.tokens,
                })
                if (result.errors) {
                    console.error(result.errors)
                } else if (!result.data.updateOrCreateContent.writeok) {
                    console.log(
                        'Write failed because of update, load new version',
                        result
                    )
                }
                refetch()
            }}
        >
            {({
                submitForm,
                isSubmitting,
                values,
                touched,
                dirty,
                setFieldValue,
                setFieldTouched,
            }) => (
                <Grid container spacing={2}>
                    <ViewWidget
                        arrayBuffer={values.fileInput.arrayBuffer()}
                        mime={values.fileInput.type}
                        name={values.name}
                    />
                    <Grid item xs={12} sm={10}>
                        <FastField
                            component={FormikTextField}
                            name="name"
                            fullWidth
                            label="Name"
                            disabled={isSubmitting}
                            validate={(val: string) => {
                                if (!val) {
                                    return 'empty'
                                }
                                return null
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                        <Tooltip title="Encrypt name">
                            <span>
                                <FastField
                                    name="encryptName"
                                    component={FormikCheckboxWithLabel}
                                    Label={{
                                        label: 'Encrypt',
                                    }}
                                    disabled={isSubmitting}
                                    type="checkbox"
                                />
                            </span>
                        </Tooltip>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <FastField
                            component={StateSelect}
                            name="state"
                            fullWidth
                            label="State"
                            disabled={isSubmitting}
                            validate={(val: string) => {
                                if (!val) {
                                    return 'empty'
                                }
                                return null
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <FastField
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
                        <FastField
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
                            value={values.textFInput}
                            onChange={(blob) => {
                                setFieldValue('fileInput', blob)
                                if (!touched.fileInput) {
                                    setFieldTouched('fileInput', true)
                                }
                            }}
                            mime={mime}
                            disabled={isSubmitting}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <FastField name="fileInput" disabled={isSubmitting}>
                            {(formikFieldProps: FieldProps) => {
                                return (
                                    <>
                                        <UploadButton
                                            name="fileInput"
                                            onChange={(ev) => {
                                                if (
                                                    ev.target.files &&
                                                    ev.target.files.length
                                                ) {
                                                    setFieldValue(
                                                        'fileInput',
                                                        ev.target.files[0]
                                                    )
                                                    setFieldValue(
                                                        'textFInput',
                                                        ev.target.files[0]
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
                                                disabled={isSubmitting}
                                                variant="contained"
                                                color="primary"
                                                component="span"
                                            >
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
                        </FastField>
                    </Grid>
                    <Grid item xs={12}>
                        {isSubmitting && <LinearProgress />}
                    </Grid>
                    <Grid item xs={12}>
                        <Button
                            variant="contained"
                            color="primary"
                            disabled={isSubmitting || !dirty}
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
    const { mainCtx } = React.useContext(Contexts.Main)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            add={AddFile}
            view={ViewFile}
            edit={EditFile}
        />
    )
}
