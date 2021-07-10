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
import { FastField, Field, FieldArray, FieldProps, Form, Formik } from 'formik'
import {
    CheckboxWithLabel as FormikCheckboxWithLabel,
    TextField as FormikTextField,
} from 'formik-material-ui'
import * as React from 'react'
import { useAsync } from 'react-async'

import ActionsDialog from '../components/ActionsDialog'
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
import {
    ActionInputEntry,
    CertificateInputEntry,
    generateActionMapper,
    transformActions,
} from '../utils/action'
import { extractAuthInfo, extractPrivKeys } from '../utils/config'
import { findWorkingHashAlgorithms } from '../utils/encryption'
import { extractPubKeysCluster } from '../utils/graphql'
import { useFixedQuery } from '../utils/hooks'
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

interface FileInternProps {
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithms: string[]
    node?: any
    tags?: { [name: string]: string[] }
    data?: Blob | null
    setCluster: (arg: string) => void
}

const FileIntern = ({
    disabled,
    node,
    tags,
    data,
    setCluster,
}: FileInternProps) => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [open, setOpen] = React.useState(false)
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    const client = useApolloClient()
    let name: string = mainCtx.item as string
    let encryptName = true
    if (tags) {
        if (tags['ename'] && tags['ename'].length > 0) {
            name = tags['ename'][0]
        } else if (tags.name && tags.name.length > 0) {
            name = tags.name[0]
            encryptName = false
        }
    }
    const state =
        tags?.state &&
        tags.state.length > 0 &&
        Constants.contentStates.has(tags.state[0])
            ? tags.state[0]
            : 'internal'

    return (
        <Formik
            initialValues={{
                plainInput: '',
                htmlInput: '',
                fileInput: data ? data : null,
                state,
                name,
                encryptName,
                keywords: tags?.keywords || [],
                cluster:
                    node?.cluster?.id ||
                    (searchCtx.cluster ? searchCtx.cluster : null),
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
                    errors['plainInput'] =
                        errors['htmlInput'] =
                        errors['fileInput'] =
                            'only one can be set'
                } else if (
                    !values.plainInput &&
                    !values.htmlInput &&
                    !values.fileInput
                ) {
                    errors['plainInput'] =
                        errors['htmlInput'] =
                        errors['fileInput'] =
                            'one field must be set'
                }

                return errors
            }}
            onSubmit={async (
                values,
                { setSubmitting, setValues, setFieldValue, setFieldTouched }
            ) => {
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
                    fetchPolicy: 'network-only',
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
                                ? `ename=${Buffer.from(values.name).toString(
                                      'base64'
                                  )}`
                                : `name=${values.name}`,
                            `mime=${Buffer.from(value.type).toString(
                                'base64'
                            )}`,
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
                        action: 'update',
                    })
                } catch (exc) {
                    console.error(exc)
                    setSubmitting(false)
                }
            }}
        >
            {({
                submitForm,
                isSubmitting,
                values,
                setValues,
                dirty,
                setFieldTouched,
                touched,
                setFieldValue,
            }) => {
                React.useEffect(() => {
                    setCluster(values.cluster)
                }, [values.cluster])
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
                        <FieldArray name="actions">
                            {({ remove, replace, form }) => {
                                return (
                                    <ActionsDialog
                                        remove={remove}
                                        replace={replace}
                                        form={form}
                                        disabled={isSubmitting}
                                        handleClose={() => setOpen(false)}
                                        open={open}
                                    />
                                )
                            }}
                        </FieldArray>

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
                            {!data ? (
                                <>
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
                                        sm={
                                            mainCtx.type != 'Text'
                                                ? 6
                                                : undefined
                                        }
                                    >
                                        <Field name="htmlInput">
                                            {(formikFieldProps: FieldProps) => {
                                                return (
                                                    <SunEditor
                                                        value={
                                                            formikFieldProps
                                                                .meta.value
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
                                                            formikFieldProps
                                                                .meta.error
                                                        }
                                                        error={
                                                            !!formikFieldProps
                                                                .meta.error &&
                                                            !!formikFieldProps
                                                                .meta.touched
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
                                                                    ev.target
                                                                        .files &&
                                                                    ev.target
                                                                        .files
                                                                        .length >
                                                                        0
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
                                                                            ev
                                                                                .target
                                                                                .files[0]
                                                                                .name
                                                                        )
                                                                    }
                                                                    formikFieldProps.form.setFieldValue(
                                                                        'fileInput',
                                                                        ev
                                                                            .target
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
                                                                mainCtx.type ==
                                                                'Text'
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
                                                                    fileInput:
                                                                        null,
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
                                                                        .meta
                                                                        .touched
                                                                        ? 'error'
                                                                        : undefined
                                                                }
                                                            >
                                                                {
                                                                    formikFieldProps
                                                                        .meta
                                                                        .error
                                                                }
                                                            </Typography>
                                                        )}
                                                    </>
                                                )
                                            }}
                                        </Field>
                                    </Grid>
                                </>
                            ) : (
                                <>
                                    <Grid item xs={12}>
                                        <TextFileAdapter
                                            value={values.fileInput as Blob}
                                            onChange={(blob) => {
                                                setFieldValue('fileInput', blob)
                                                if (!touched.fileInput) {
                                                    setFieldTouched(
                                                        'fileInput',
                                                        true
                                                    )
                                                }
                                            }}
                                            mime={
                                                (values.fileInput as Blob).type
                                            }
                                            disabled={disabled}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <FastField
                                            name="fileInput"
                                            disabled={isSubmitting}
                                        >
                                            {(formikFieldProps: FieldProps) => {
                                                return (
                                                    <>
                                                        <UploadButton
                                                            name="fileInput"
                                                            onChange={(ev) => {
                                                                if (
                                                                    ev.target
                                                                        .files &&
                                                                    ev.target
                                                                        .files
                                                                        .length
                                                                ) {
                                                                    setFieldValue(
                                                                        'fileInput',
                                                                        ev
                                                                            .target
                                                                            .files[0]
                                                                    )
                                                                    setFieldValue(
                                                                        'textFInput',
                                                                        ev
                                                                            .target
                                                                            .files[0]
                                                                    )
                                                                }
                                                            }}
                                                            accept={
                                                                mainCtx.type ==
                                                                'Text'
                                                                    ? 'text/*'
                                                                    : undefined
                                                            }
                                                        >
                                                            <Button
                                                                disabled={
                                                                    isSubmitting
                                                                }
                                                                variant="contained"
                                                                color="primary"
                                                                component="span"
                                                            >
                                                                Upload
                                                            </Button>
                                                        </UploadButton>
                                                        {formikFieldProps.meta
                                                            .error && (
                                                            <Typography
                                                                color={
                                                                    formikFieldProps
                                                                        .meta
                                                                        .touched
                                                                        ? 'error'
                                                                        : undefined
                                                                }
                                                            >
                                                                {
                                                                    formikFieldProps
                                                                        .meta
                                                                        .error
                                                                }
                                                            </Typography>
                                                        )}
                                                    </>
                                                )
                                            }}
                                        </FastField>
                                    </Grid>
                                </>
                            )}

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

const ViewFile = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] =
        React.useState<{
            mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
            hashAlgorithms: string[]
            node: any
            tags: { [name: string]: string[] }
            data: Blob | null
            key: string
        } | null>(null)

    useFixedQuery(contentRetrievalQuery, {
        pollInterval: 60000,
        fetchPolicy: 'cache-and-network',
        variables: {
            variables: {
                id: mainCtx.item as string,
                authorization: mainCtx.tokens,
            },
        },
        onCompleted: async (data) => {
            if (!data) {
                return
            }
            const updateOb = {
                shareUrl: data.secretgraph.node.link,
                deleted: data.secretgraph.node.deleted || null,
                updateId: data.secretgraph.node.updateId,
            }
            updateMainCtx(updateOb)
            const mapper = generateActionMapper({
                nodeData: data.secretgraph.node,
                config,
                knownHashes: [
                    data.secretgraph.node.cluster.availableActions,
                    data.secretgraph.node.availableActions,
                ],
                hashAlgorithm: findWorkingHashAlgorithms(
                    data.secretgraph.config.hashAlgorithms
                )[0],
            })
            const obj = await decryptContentObject({
                config,
                nodeData: data.secretgraph.node,
                blobOrTokens: mainCtx.tokens,
                decrypt: decryptSet,
            })
            if (!obj) {
                console.error('failed decoding')
                return
            }
            setData({
                hashAlgorithms: data.secretgraph.config.hashAlgorithms,
                tags: obj.tags,
                node: data.secretgraph.node,
                mapper: await mapper,
                data: new Blob([obj.data]),
                key: `${new Date().getTime()}`,
            })
        },
    })
    if (!data) {
        return null
    }
    return <FileIntern disabled {...data} setCluster={() => {}} />
}

const AddFile = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [open, setOpen] = React.useState(false)
    const [data, setData] =
        React.useState<{
            mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
            hashAlgorithms: string[]
            data?: Blob | null
            key: string | number
        } | null>(null)
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    const client = useApolloClient()
    const [cluster, setCluster] = React.useState(
        searchCtx.cluster || config.configCluster
    )
    const { data: dataUnfinished } = useQuery(getContentConfigurationQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            variables: {
                id: cluster as string,
                authorization: mainCtx.tokens,
            },
        },
    })

    React.useEffect(() => {
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            const updateOb = {
                shareUrl: dataUnfinished.secretgraph.node.link,
                deleted: dataUnfinished.secretgraph.node.deleted || null,
                updateId: dataUnfinished.secretgraph.node.updateId,
            }
            updateMainCtx(updateOb)
            const mapper = generateActionMapper({
                nodeData: dataUnfinished.secretgraph.node,
                config,
                knownHashes: [dataUnfinished.secretgraph.node.availableActions],
                hashAlgorithm: findWorkingHashAlgorithms(
                    dataUnfinished.secretgraph.config.hashAlgorithms
                )[0],
            })
            setData({
                hashAlgorithms:
                    dataUnfinished.secretgraph.config.hashAlgorithms,
                mapper: await mapper,
                key: `${new Date().getTime()}`,
            })
        }
        f()
    }, [config, cluster])
    if (!data) {
        return null
    }

    return <FileIntern setCluster={setCluster} {...data} />
}

const EditFile = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [open, setOpen] = React.useState(false)
    const client = useApolloClient()
    const { searchCtx } = React.useContext(Contexts.Search)
    const [cluster, setCluster] = React.useState(searchCtx.cluster)
    const [data, setData] =
        React.useState<{
            mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
            hashAlgorithms: string[]
            node: any
            tags: { [name: string]: string[] }
            data: Blob | null
            key: string | number
        } | null>(null)
    const {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'network-only',
        variables: {
            variables: {
                id: mainCtx.item as string,
                authorization: mainCtx.tokens,
            },
        },
    })

    React.useEffect(() => {
        if (dataUnfinished) {
            refetch()
        }
    }, [mainCtx.updateId])
    React.useEffect(() => {
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            const updateOb = {
                shareUrl: dataUnfinished.secretgraph.node.link,
                deleted: dataUnfinished.secretgraph.node.deleted || null,
                updateId: dataUnfinished.secretgraph.node.updateId,
            }
            updateMainCtx(updateOb)
            const mapper = generateActionMapper({
                nodeData: dataUnfinished.secretgraph.node,
                config,
                knownHashes: [
                    dataUnfinished.secretgraph.node.cluster.availableActions,
                    dataUnfinished.secretgraph.node.availableActions,
                ],
                hashAlgorithm: findWorkingHashAlgorithms(
                    dataUnfinished.secretgraph.config.hashAlgorithms
                )[0],
            })
            const obj = await decryptContentObject({
                config,
                nodeData: dataUnfinished.secretgraph.node,
                blobOrTokens: mainCtx.tokens,
                decrypt: decryptSet,
            })
            if (!obj) {
                console.error('failed decoding')
                return
            }
            setData({
                hashAlgorithms:
                    dataUnfinished.secretgraph.config.hashAlgorithms,
                tags: obj.tags,
                node: dataUnfinished.secretgraph.node,
                mapper: await mapper,
                data: new Blob([obj.data]),
                key: `${new Date().getTime()}`,
            })
        }
        f()
    }, [dataUnfinished, config, cluster])

    if (!data) {
        return null
    }
    return <FileIntern {...data} setCluster={setCluster} disabled={loading} />
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
