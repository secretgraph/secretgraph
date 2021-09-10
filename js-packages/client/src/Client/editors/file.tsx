import { useApolloClient, useQuery } from '@apollo/client'
import Button from '@material-ui/core/Button'
import Checkbox from '@material-ui/core/Checkbox'
import FormControlLabel from '@material-ui/core/FormControlLabel'
import Grid from '@material-ui/core/Grid'
import LinearProgress from '@material-ui/core/LinearProgress'
import { useTheme } from '@material-ui/core/styles'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import Tooltip from '@material-ui/core/Tooltip'
import Typography from '@material-ui/core/Typography'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { contentRetrievalQuery } from '@secretgraph/misc/queries/content'
import { getContentConfigurationQuery } from '@secretgraph/misc/queries/content'
import { UnpackPromise, ValueType } from '@secretgraph/misc/typing'
import {
    ActionInputEntry,
    CertificateInputEntry,
    generateActionMapper,
    transformActions,
} from '@secretgraph/misc/utils/action'
import {
    extractAuthInfo,
    extractPrivKeys,
} from '@secretgraph/misc/utils/config'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/encryption'
import { extractPubKeysCluster } from '@secretgraph/misc/utils/graphql'
import {
    createContent,
    decryptContentObject,
    updateContent,
} from '@secretgraph/misc/utils/operations'
import * as SetOps from '@secretgraph/misc/utils/set'
import * as DOMPurify from 'dompurify'
import { FastField, Field, FieldArray, FieldProps, Form, Formik } from 'formik'
import * as React from 'react'
import { useAsync } from 'react-async'

import ActionsDialog from '../components/ActionsDialog'
import DecisionFrame from '../components/DecisionFrame'
import FormikCheckboxWithLabel from '../components/formik/FormikCheckboxWithLabel'
import FormikTextField from '../components/formik/FormikTextField'
import ClusterSelect from '../components/forms/ClusterSelect'
import SimpleSelect from '../components/forms/SimpleSelect'
import StateSelect from '../components/forms/StateSelect'
import SunEditor from '../components/SunEditor'
import UploadButton from '../components/UploadButton'
import * as Contexts from '../contexts'

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
    nodeData?: any
    tags?: { [name: string]: string[] }
    tokens: string[]
    data?: Blob | null
    url: string
    setCluster: (arg: string) => void
}

const FileIntern = ({
    disabled,
    nodeData,
    tags,
    data,
    setCluster,
    mapper,
    url,
    hashAlgorithms,
    tokens,
}: FileInternProps) => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [open, setOpen] = React.useState(false)
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    const client = useApolloClient()
    let name: string = mainCtx.item || ''
    const actions = React.useMemo(() => {
        const actions: (ActionInputEntry | CertificateInputEntry)[] = []
        Object.values<ValueType<typeof mapper>>(mapper).forEach((params) => {
            const entry = mapper[params.newHash]
            if (entry.type == 'action') {
                for (const actionType of entry.actions) {
                    actions.push({
                        type: 'action',
                        data: params.data,
                        newHash: params.newHash,
                        oldHash: params.oldHash || undefined,
                        start: '',
                        stop: '',
                        note: entry.note || '',
                        value: {
                            action: actionType,
                        },
                        update: entry.hasUpdate,
                        delete: false,
                        readonly: false,
                    })
                }
            } else {
                actions.push({
                    type: 'certificate',
                    data: params.data,
                    newHash: params.newHash,
                    oldHash: params.oldHash || undefined,
                    note: entry.note || '',
                    update: entry.hasUpdate,
                    delete: false,
                    readonly: false,
                    locked: true,
                })
            }
        })
        return actions
    }, [mapper])
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
                    nodeData?.cluster?.id ||
                    (searchCtx.cluster ? searchCtx.cluster : null),
                actions,
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
                { actions: actionsNew, ...values },
                { setSubmitting, setValues, setFieldValue, setFieldTouched }
            ) => {
                const hashAlgorithm = hashAlgorithms[0]
                const {
                    hashes,
                    actions: finishedActions,
                    configUpdate,
                } = await transformActions({
                    actions: actionsNew,
                    mapper,
                    hashAlgorithm,
                })
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
                const pubkeysResult = await client.query({
                    fetchPolicy: 'network-only',
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: tokens,
                        id: values.cluster,
                    },
                })
                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url,
                    hashAlgorithm,
                })
                const pubkeys = extractPubKeysCluster({
                    node: pubkeysResult.data.secretgraph.node,
                    authorization: tokens,
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
                        authorization: tokens,
                    })
                    updateMainCtx({
                        item: result.data.updateOrCreateContent.content.id,
                        updateId:
                            result.data.updateOrCreateContent.content.updateId,
                        url,
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
                    values.cluster && setCluster(values.cluster)
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
                                    url={url}
                                    name="cluster"
                                    disabled={isSubmitting}
                                    label="Cluster"
                                    firstIfEmpty
                                    tokens={tokens}
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
                                        <Grid item xs={12} md={6}>
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
                                        md={
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

const EditFile = ({ viewOnly = false }: { viewOnly?: boolean }) => {
    const theme = useTheme()
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [open, setOpen] = React.useState(false)
    const client = useApolloClient()
    const { searchCtx } = React.useContext(Contexts.Search)
    const [cluster, setCluster] = React.useState<string | null>(null)
    const [data, setData] =
        React.useState<{
            mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
            hashAlgorithms: string[]
            nodeData: any
            tags: { [name: string]: string[] }
            data: Blob | null
            key: string | number
        } | null>(null)

    const authorization = React.useMemo(() => {
        const authinfo = extractAuthInfo({
            config,
            url: mainCtx.url as string,
            clusters: new Set([
                ...(cluster ? [cluster] : []),
                ...(data?.nodeData?.cluster ? [data?.nodeData?.cluster] : []),
            ]),
            require: viewOnly ? undefined : new Set(['update', 'manage']),
        })
        return [...new Set([...mainCtx.tokens, ...authinfo.tokens])]
    }, [mainCtx.url, config, mainCtx.tokens])
    let {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'network-only',
        variables: {
            id: mainCtx.item as string,
            authorization,
        },
        onError: console.error,
    })

    React.useEffect(() => {
        if (dataUnfinished) {
            loading = true
            refetch()
        }
    }, [mainCtx.updateId])

    React.useEffect(() => {
        if (
            dataUnfinished &&
            dataUnfinished.secretgraph.node.cluster.id != cluster
        ) {
            loading = true
            refetch()
        }
    }, [cluster])
    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        if (!cluster) {
            if (!dataUnfinished.secretgraph.node.cluster.id) {
                throw Error('no cluster found')
            }
            setCluster(dataUnfinished.secretgraph.node.cluster.id)
        }
        loading = true
        const f = async () => {
            const updateOb = {
                shareUrl: dataUnfinished.secretgraph.node.link,
                deleted: dataUnfinished.secretgraph.node.deleted || null,
                updateId: dataUnfinished.secretgraph.node.updateId,
            }
            updateMainCtx(updateOb)
            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const contentstuff =
                host && host.contents[dataUnfinished.secretgraph.node.id]
            const mapper = generateActionMapper({
                config,
                knownHashes: [
                    dataUnfinished.secretgraph.node.cluster?.availableActions,
                    dataUnfinished.secretgraph.node.availableActions,
                    contentstuff &&
                        host?.clusters[contentstuff.cluster]?.hashes,
                    contentstuff?.hashes,
                ],
                hashAlgorithms:
                    dataUnfinished.secretgraph.config.hashAlgorithms,
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
                ...obj,
                hashAlgorithms:
                    dataUnfinished.secretgraph.config.hashAlgorithms,
                mapper: await mapper,
                data: new Blob([obj.data]),
                key: `${new Date().getTime()}`,
            })
            loading = false
        }
        f()
    }, [dataUnfinished, config])

    if (!data) {
        return null
    }
    return (
        <FileIntern
            {...data}
            tokens={authorization}
            url={mainCtx.url as string}
            setCluster={setCluster}
            disabled={loading || viewOnly}
        />
    )
}

const ViewFile = () => {
    return <EditFile viewOnly />
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
    const [cluster, setCluster] = React.useState(
        searchCtx.cluster || config.configCluster
    )
    const tokens = React.useMemo(
        () =>
            cluster
                ? extractAuthInfo({
                      config,
                      url: activeUrl,
                      clusters: new Set([cluster]),
                      require: new Set(['create', 'manage']),
                  }).tokens
                : [],
        [config, cluster, activeUrl]
    )
    const authorization = React.useMemo(
        () => [...new Set([...mainCtx.tokens, ...tokens])],
        [tokens, mainCtx.tokens]
    )
    const { data: dataUnfinished, refetch } = useQuery(
        getContentConfigurationQuery,
        {
            fetchPolicy: 'cache-and-network',
            variables: {
                id: cluster || '',
                authorization,
            },
            onError: console.error,
        }
    )

    React.useEffect(() => {
        if (dataUnfinished) {
            refetch()
        }
    }, [cluster, activeUrl])

    React.useEffect(() => {
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            const updateOb = {
                shareUrl: null,
                deleted: null,
                updateId: null,
            }
            updateMainCtx(updateOb)
            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const mapper = generateActionMapper({
                config,
                knownHashes: dataUnfinished.secretgraph.node
                    ? [
                          dataUnfinished.secretgraph.node.availableActions,
                          host?.clusters[dataUnfinished.secretgraph.node.id]
                              ?.hashes,
                      ]
                    : [],
                hashAlgorithms:
                    dataUnfinished.secretgraph.config.hashAlgorithms,
            })
            setData({
                hashAlgorithms:
                    dataUnfinished.secretgraph.config.hashAlgorithms,
                mapper: await mapper,
                key: `${new Date().getTime()}`,
            })
        }
        f()
    }, [config, dataUnfinished])
    if (!data) {
        return null
    }

    return (
        <FileIntern
            url={activeUrl}
            setCluster={setCluster}
            tokens={authorization}
            {...data}
        />
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
