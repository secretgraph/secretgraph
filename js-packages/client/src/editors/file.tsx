import { useQuery } from '@apollo/client'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import Security from '@mui/icons-material/Security'
import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel from '@mui/lab/TabPanel'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Tab from '@mui/material/Tab'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Box } from '@mui/system'
import {
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise } from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import { authInfoFromConfig, saveConfig } from '@secretgraph/misc/utils/config'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/hashing'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import * as DOMPurify from 'dompurify'
import { FastField, Field, FieldArray, FieldProps, Form, Formik } from 'formik'
import * as React from 'react'

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
import { mapperToArray } from '../hooks'

// hack for Suneditor
const htmlIsEmpty = (value?: string): boolean => {
    return !value || value == '<p><br></p>' || value == '<p></p>'
}

const ViewWidget = ({
    arrayBuffer,
    mime: mimeNew,
    name,
}: {
    arrayBuffer: Promise<ArrayBuffer>
    mime: string
    name: string
}) => {
    const [blobUrlOrText, setBlobUrlOrText] = React.useState<
        string | undefined
    >(undefined)
    const [mime, setMime] = React.useState<string>(mimeNew)
    React.useEffect(() => {
        let active = true
        const f = async () => {
            const _arrBuff = await arrayBuffer
            if (!_arrBuff || !active) {
                return
            }
            const oldBlobUrl = mime.startsWith('text/')
                ? undefined
                : blobUrlOrText
            if (mimeNew.startsWith('text/')) {
                try {
                    setMime(mimeNew)
                    setBlobUrlOrText(new TextDecoder().decode(_arrBuff))
                    // sanitize and render
                } catch (exc) {
                    console.error('Could not parse', exc)
                    setBlobUrlOrText(`${_arrBuff}`)
                    setMime(mimeNew)
                }
            } else {
                setBlobUrlOrText(
                    URL.createObjectURL(new Blob([_arrBuff], { type: mime }))
                )
                setMime(mimeNew)
            }
            if (oldBlobUrl) {
                URL.revokeObjectURL(oldBlobUrl)
            }
        }
        f()
        return () => {
            active = false
        }
    }, [arrayBuffer])
    if (blobUrlOrText === undefined) {
        return null
    }
    let inner: null | JSX.Element = null
    switch (mime.split('/', 1)[0]) {
        case 'text':
            if (mime == 'text/html') {
                const sanitized = DOMPurify.sanitize(blobUrlOrText)
                inner = <div dangerouslySetInnerHTML={{ __html: sanitized }} />
            } else {
                inner = <pre>{blobUrlOrText}</pre>
            }
            break
        case 'audio':
        case 'video':
            inner = (
                <video controls>
                    <source src={blobUrlOrText} style={{ width: '100%' }} />
                </video>
            )
            break
        case 'image':
            inner = (
                <a href={blobUrlOrText} rel="noopener noreferrer">
                    <img
                        src={blobUrlOrText}
                        alt={name}
                        style={{ width: '100%' }}
                    />
                </a>
            )
            break
    }
    return (
        <>
            <Box sx={{ marginBottom: (theme) => theme.spacing(2) }}>
                <Typography variant="h5">Content</Typography>
                {inner}
            </Box>
            {mime.startsWith('text/') ? null : (
                <Box sx={{ marginBottom: (theme) => theme.spacing(2) }}>
                    <a
                        href={blobUrlOrText}
                        type={mime}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <CloudDownloadIcon />
                    </a>
                </Box>
            )}
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
                InputProps={{
                    inputProps: {
                        width: '100%',
                        setOptions: {
                            minHeight: '500px',
                        },
                    },
                }}
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
    viewOnly?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithms: string[]
    nodeData?: any
    tags?: { [name: string]: string[] }
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
    viewOnly,
}: FileInternProps) => {
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const [open, setOpen] = React.useState(false)
    const [tab, setTab] = React.useState(() => {
        if (!nodeData || data?.type == 'text/html') {
            return 'html'
        } else if (data?.type.startsWith('text/')) {
            return 'plain'
        } else if (data?.type?.startsWith('audio/')) {
            return 'audio'
        } else if (data?.type?.startsWith('video/')) {
            return 'video'
        } else {
            return 'hex'
        }
    })
    const clusterSelectTokens = React.useMemo(() => {
        return authInfoFromConfig({
            config,
            url,
            require: new Set(['create', 'manage']),
        }).tokens
    }, [config])
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    let name: string = ''

    const actions = mapperToArray(mapper, { lockExisting: !!mainCtx.item })
    let encryptName = true
    if (tags) {
        if (tags.name && tags.name.length > 0) {
            name = tags.name[0]
            encryptName = false
        }
        if (tags['~name'] && tags['~name'].length > 0) {
            name = tags['~name'][0]
            encryptName = true
        }
    }
    const state = nodeData?.state || 'internal'
    if (state == 'public') {
        encryptName = false
    }
    // <SimpleShareDialog shareUrl={nodeData?.link} />
    return (
        <>
            <Formik
                initialValues={{
                    plainInput: '',
                    htmlInput: '',
                    // when viewing existing data: fileInput is used
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
                    const errors: Partial<{
                        [key in keyof typeof values]: string
                    }> = {}
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
                    { setSubmitting }
                ) => {
                    const hashAlgorithm = hashAlgorithms[0]
                    let value: Blob
                    if (values.plainInput) {
                        value = new Blob([values.plainInput], {
                            type: 'text/plain',
                        })
                    } else if (values.fileInput) {
                        value = values.fileInput
                    } else if (!htmlIsEmpty(values.htmlInput)) {
                        // html check is hacky, check first the others
                        value = new Blob(
                            [DOMPurify.sanitize(values.htmlInput)],
                            {
                                type: 'text/html',
                            }
                        )
                    } else {
                        throw Error('no input found')
                    }
                    const res = await updateOrCreateContentWithConfig({
                        actions: actionsNew,
                        config,
                        mapper,
                        cluster: values.cluster,
                        value,
                        itemClient,
                        baseClient,
                        authorization: mainCtx.tokens,
                        state: values.state,
                        type: value.type.startsWith('text/') ? 'Text' : 'File',
                        tags: [
                            !values.encryptName || values.state == 'public'
                                ? `name=${values.name}`
                                : `~name=${values.name}`,
                            `mime=${value.type}`,
                        ].concat(
                            values.keywords.map((val) => `keyword=${val}`)
                        ),
                        id: nodeData?.id,
                        updateId: nodeData?.updateId,
                        url,
                        hashAlgorithm,
                    })
                    if (res) {
                        if (res.config) {
                            const nTokens = authInfoFromConfig({
                                config: res.config,
                                url,
                                clusters: values.cluster
                                    ? new Set([values.cluster])
                                    : undefined,
                                require: new Set(['update', 'manage']),
                            }).tokens
                            saveConfig(res.config)
                            updateConfig(res.config, true)
                            updateMainCtx({
                                item: res.node.id,
                                updateId: res.node.updateId,
                                url,
                                action: 'update',
                                tokens: [
                                    ...new Set(...mainCtx.tokens, ...nTokens),
                                ],
                            })
                        } else {
                            updateMainCtx({
                                item: res.node.id,
                                updateId: res.node.updateId,
                                url,
                                action: 'update',
                            })
                        }
                    } else {
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
                    React.useEffect(() => {
                        values.state == 'public' &&
                            setFieldValue('encryptName', false)
                    }, [values.state])
                    let preview = null
                    if (values.plainInput) {
                        preview = (
                            <ViewWidget
                                arrayBuffer={new Blob([
                                    values.plainInput,
                                ]).arrayBuffer()}
                                mime="text/plain"
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
                                mime="text/html"
                                name={values.name}
                            />
                        )
                    }
                    const form = (
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={disabled ? 10 : 9}>
                                <FastField
                                    component={FormikTextField}
                                    name="name"
                                    fullWidth
                                    label="Name"
                                    disabled={isSubmitting || disabled}
                                    validate={(val: string) => {
                                        if (!val) {
                                            return 'empty'
                                        }
                                        return null
                                    }}
                                />
                            </Grid>
                            <Grid item xs sm="auto">
                                <Tooltip title="Encrypt name">
                                    <span>
                                        <Field
                                            name="encryptName"
                                            component={FormikCheckboxWithLabel}
                                            Label={{
                                                label: 'Encrypt',
                                            }}
                                            disabled={
                                                isSubmitting ||
                                                values.state == 'public' ||
                                                disabled
                                            }
                                            type="checkbox"
                                        />
                                    </span>
                                </Tooltip>
                            </Grid>
                            {viewOnly ? null : (
                                <Grid item xs="auto">
                                    <Tooltip title="Actions">
                                        <span>
                                            <IconButton
                                                onClick={() => setOpen(!open)}
                                                size="large"
                                            >
                                                <Security />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Grid>
                            )}

                            <Grid item xs={12} md={4}>
                                <FastField
                                    component={StateSelect}
                                    name="state"
                                    fullWidth
                                    label="State"
                                    disabled={isSubmitting || disabled}
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
                                    disabled={isSubmitting || disabled}
                                    label="Cluster"
                                    firstIfEmpty
                                    tokens={clusterSelectTokens}
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
                                    disabled={isSubmitting || disabled}
                                    options={[]}
                                    label="Keywords"
                                    freeSolo
                                    multiple
                                />
                            </Grid>
                            {viewOnly ? null : (
                                <>
                                    <Grid item xs={12}>
                                        <TabContext value={tab}>
                                            <Box
                                                sx={{
                                                    borderBottom: 1,
                                                    borderColor: 'divider',
                                                }}
                                            >
                                                <TabList
                                                    onChange={(ev, val) =>
                                                        setTab(val)
                                                    }
                                                    aria-label=""
                                                >
                                                    <Tab
                                                        label="Plain"
                                                        value="plain"
                                                        disabled={
                                                            !!(
                                                                values.fileInput ||
                                                                !htmlIsEmpty(
                                                                    values.htmlInput
                                                                )
                                                            )
                                                        }
                                                    />
                                                    <Tab
                                                        label="Website"
                                                        value="html"
                                                        disabled={
                                                            !!(
                                                                values.plainInput ||
                                                                values.fileInput
                                                            )
                                                        }
                                                    />
                                                    <Tab
                                                        label="Video"
                                                        value="video"
                                                        disabled={
                                                            !!(
                                                                values.plainInput ||
                                                                !htmlIsEmpty(
                                                                    values.htmlInput
                                                                )
                                                            )
                                                        }
                                                    />
                                                    <Tab
                                                        label="Audio"
                                                        value="audio"
                                                        disabled={
                                                            !!(
                                                                values.plainInput ||
                                                                !htmlIsEmpty(
                                                                    values.htmlInput
                                                                )
                                                            )
                                                        }
                                                    />
                                                    <Tab
                                                        label="Hex"
                                                        value="hex"
                                                        disabled={
                                                            !!(
                                                                values.plainInput ||
                                                                !htmlIsEmpty(
                                                                    values.htmlInput
                                                                )
                                                            )
                                                        }
                                                    />
                                                </TabList>
                                            </Box>
                                            <TabPanel value="plain">
                                                {!data ? (
                                                    <Field
                                                        component={
                                                            FormikTextField
                                                        }
                                                        name="plainInput"
                                                        label="Text"
                                                        fullWidth
                                                        variant="outlined"
                                                        multiline
                                                        minRows={10}
                                                        disabled={
                                                            !!(
                                                                isSubmitting ||
                                                                values.htmlInput ||
                                                                values.fileInput
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    <TextFileAdapter
                                                        value={
                                                            values.fileInput as Blob
                                                        }
                                                        onChange={(blob) => {
                                                            setFieldValue(
                                                                'fileInput',
                                                                blob
                                                            )
                                                            setFieldTouched(
                                                                'fileInput',
                                                                true
                                                            )
                                                        }}
                                                        mime={
                                                            (
                                                                values.fileInput as Blob
                                                            ).type
                                                        }
                                                        disabled={disabled}
                                                    />
                                                )}
                                            </TabPanel>
                                            <TabPanel value="html">
                                                {!data ? (
                                                    <Field name="htmlInput">
                                                        {(
                                                            formikFieldProps: FieldProps
                                                        ) => {
                                                            return (
                                                                <SunEditor
                                                                    value={
                                                                        formikFieldProps
                                                                            .meta
                                                                            .value
                                                                    }
                                                                    InputProps={{
                                                                        inputProps:
                                                                            {
                                                                                width: '100%',
                                                                                setOptions:
                                                                                    {
                                                                                        minHeight:
                                                                                            '500px',
                                                                                    },
                                                                            },
                                                                    }}
                                                                    name="htmlInput"
                                                                    label="Html Text"
                                                                    variant="outlined"
                                                                    minRows={10}
                                                                    onChange={(
                                                                        ev
                                                                    ) => {
                                                                        formikFieldProps.form.setFieldValue(
                                                                            'htmlInput',
                                                                            ev
                                                                                .target
                                                                                .value
                                                                        )
                                                                    }}
                                                                    helperText={
                                                                        formikFieldProps
                                                                            .meta
                                                                            .error
                                                                    }
                                                                    error={
                                                                        !!formikFieldProps
                                                                            .meta
                                                                            .error &&
                                                                        !!formikFieldProps
                                                                            .meta
                                                                            .touched
                                                                    }
                                                                    disabled={
                                                                        !!isSubmitting
                                                                    }
                                                                />
                                                            )
                                                        }}
                                                    </Field>
                                                ) : (
                                                    <TextFileAdapter
                                                        value={
                                                            values.fileInput as Blob
                                                        }
                                                        onChange={(blob) => {
                                                            setFieldValue(
                                                                'fileInput',
                                                                blob
                                                            )
                                                            setFieldTouched(
                                                                'fileInput',
                                                                true
                                                            )
                                                        }}
                                                        mime={
                                                            (
                                                                values.fileInput as Blob
                                                            ).type
                                                        }
                                                        disabled={disabled}
                                                    />
                                                )}
                                            </TabPanel>
                                            <TabPanel value="video">
                                                Video, TODO
                                            </TabPanel>
                                            <TabPanel value="audio">
                                                Audio, TODO
                                            </TabPanel>
                                            <TabPanel value="hex">
                                                Hex, TODO
                                            </TabPanel>
                                        </TabContext>
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

                                                                    setFieldTouched(
                                                                        'fileInput',
                                                                        true
                                                                    )
                                                                } else {
                                                                    formikFieldProps.form.setFieldValue(
                                                                        'fileInput',
                                                                        null
                                                                    )
                                                                    setFieldTouched(
                                                                        'fileInput',
                                                                        false
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
                                                            onClick={() => {
                                                                setValues({
                                                                    ...values,
                                                                    fileInput:
                                                                        null,
                                                                })
                                                                setFieldTouched(
                                                                    'fileInput',
                                                                    false
                                                                )
                                                            }}
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
                            )}

                            <Grid item xs={12}>
                                {isSubmitting && <LinearProgress />}
                            </Grid>
                            <Grid item xs={12}>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    disabled={
                                        (isSubmitting || !dirty) &&
                                        !touched?.fileInput
                                    }
                                    onClick={submitForm}
                                >
                                    Submit
                                </Button>
                            </Grid>
                        </Grid>
                    )
                    return (
                        <Form>
                            <FieldArray name="actions">
                                {({ remove, replace, push, form }) => {
                                    return (
                                        <ActionsDialog
                                            remove={remove}
                                            replace={replace}
                                            push={push}
                                            form={form}
                                            disabled={isSubmitting || disabled}
                                            handleClose={() => setOpen(false)}
                                            open={open}
                                            isContent
                                            isPublic={values.state == 'public'}
                                        />
                                    )
                                }}
                            </FieldArray>
                            {preview}
                            {viewOnly ? (
                                <details>
                                    <summary
                                        style={{
                                            whiteSpace: 'nowrap',
                                            paddingRight: '4px',
                                        }}
                                    >
                                        <span
                                            style={{
                                                display: 'inline-block',
                                            }}
                                        >
                                            <Grid
                                                container
                                                wrap="nowrap"
                                                alignItems="center"
                                                style={{
                                                    marginLeft: 0,
                                                    marginRight: 0,
                                                }}
                                            >
                                                <Grid
                                                    item
                                                    xs
                                                    style={{
                                                        whiteSpace: 'normal',
                                                    }}
                                                >
                                                    {name}
                                                </Grid>

                                                <Grid item xs="auto">
                                                    <Tooltip title="Actions">
                                                        <span>
                                                            <IconButton
                                                                onClick={() =>
                                                                    setOpen(
                                                                        !open
                                                                    )
                                                                }
                                                                size="large"
                                                            >
                                                                <Security />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                </Grid>
                                            </Grid>
                                        </span>
                                    </summary>
                                    <Box
                                        sx={{
                                            padding: (theme) =>
                                                theme.spacing(2),
                                        }}
                                    >
                                        {form}
                                    </Box>
                                </details>
                            ) : (
                                <Box
                                    sx={{
                                        padding: (theme) => theme.spacing(1),
                                    }}
                                >
                                    {form}
                                </Box>
                            )}
                        </Form>
                    )
                }}
            </Formik>
        </>
    )
}

const EditFile = ({ viewOnly = false }: { viewOnly?: boolean }) => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] = React.useState<{
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
        hashAlgorithms: string[]
        nodeData: any
        tags: { [name: string]: string[] }
        data: Blob | null
        key: string | number
    } | null>(null)

    let {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'network-only',
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
            includeTags: ['name=', '~name=', 'mime='],
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
            dataUnfinished.secretgraph.node.cluster.id != mainCtx.cluster
        ) {
            loading = true
            refetch()
        }
    }, [mainCtx.cluster])
    React.useEffect(() => {
        if (!dataUnfinished || loading) {
            return
        }
        if (!dataUnfinished.secretgraph.node) {
            console.log('empty node, permissions?')
            return
        }
        if (!mainCtx.cluster) {
            if (!dataUnfinished.secretgraph.node.cluster.id) {
                throw Error('no cluster found')
            }
            updateMainCtx({
                cluster: dataUnfinished.secretgraph.node.cluster.id,
            })
        }
        loading = true
        let active = true
        const f = async () => {
            const updateOb: Partial<Interfaces.MainContextInterface> = {
                //shareUrl: dataUnfinished.secretgraph.node.link,
                deleted: dataUnfinished.secretgraph.node.deleted || null,
                updateId: dataUnfinished.secretgraph.node.updateId,
                tokensPermissions: new Set([
                    ...mainCtx.tokensPermissions,
                    ...dataUnfinished.secretgraph.node.availableActions.map(
                        (val: { keyHash: string; type: string }) => val.type
                    ),
                ]),
            }
            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const contentstuff =
                host && host.contents[dataUnfinished.secretgraph.node.id]

            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )
            const mapper = await generateActionMapper({
                config,
                knownHashesCluster: [
                    dataUnfinished.secretgraph.node.cluster?.availableActions,
                    contentstuff &&
                        host?.clusters[contentstuff.cluster]?.hashes,
                ],
                knownHashesContent: [
                    dataUnfinished.secretgraph.node.availableActions,
                    contentstuff?.hashes,
                ],
                hashAlgorithms,
            })
            if (!active) {
                return
            }

            const obj = await decryptContentObject({
                config,
                nodeData: dataUnfinished.secretgraph.node,
                blobOrTokens: mainCtx.tokens,
            })
            if (!obj) {
                console.error('failed decoding')
                return
            }
            if (!active) {
                return
            }

            let name: string = mainCtx.item || ''

            if (obj.tags.name && obj.tags.name.length > 0) {
                name = obj.tags.name[0]
            } else if (obj.tags['~name'] && obj.tags['~name'].length > 0) {
                name = obj.tags['~name'][0]
            }
            updateOb['title'] = name
            updateMainCtx(updateOb)
            setData({
                ...obj,
                hashAlgorithms,
                mapper,
                data: new Blob([obj.data], {
                    type:
                        (obj.tags?.mime ? obj.tags.mime[0] : undefined) ??
                        'application/octet-stream',
                }),
                key: `${new Date().getTime()}`,
            })
            loading = false
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished, config])

    if (!data) {
        return null
    }
    return (
        <FileIntern
            {...data}
            url={mainCtx.url as string}
            setCluster={(cluster: string) => updateMainCtx({ cluster })}
            disabled={loading || viewOnly}
            viewOnly={viewOnly}
        />
    )
}

const ViewFile = () => {
    return <EditFile viewOnly />
}

const CreateFile = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] = React.useState<{
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
        hashAlgorithms: string[]
        data?: Blob | null
        key: string | number
    } | null>(null)
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    const { data: dataUnfinished, refetch } = useQuery(
        getContentConfigurationQuery,
        {
            fetchPolicy: 'cache-and-network',
            variables: {
                id: mainCtx.cluster || Constants.stubCluster,
                authorization: mainCtx.tokens,
            },
            onError: console.error,
        }
    )

    React.useEffect(() => {
        if (dataUnfinished) {
            refetch()
        }
    }, [mainCtx.cluster, activeUrl])

    React.useEffect(() => {
        let active = true
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )
            const updateOb = {
                //shareUrl: null,
                deleted: null,
                updateId: null,
            }
            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const mapper = await generateActionMapper({
                config,
                knownHashesCluster: dataUnfinished.secretgraph.node
                    ? [
                          dataUnfinished.secretgraph.node.availableActions,
                          host?.clusters[dataUnfinished.secretgraph.node.id]
                              ?.hashes,
                      ]
                    : [],
                hashAlgorithms,
            })
            if (active) {
                updateMainCtx(updateOb)
                setData({
                    hashAlgorithms,
                    mapper,
                    key: `${new Date().getTime()}`,
                })
            }
        }
        f()
        return () => {
            active = false
        }
    }, [config, dataUnfinished])
    if (!data) {
        return null
    }

    return (
        <FileIntern
            url={activeUrl}
            setCluster={(cluster: string) => updateMainCtx({ cluster })}
            {...data}
        />
    )
}

export default function FileComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            updateMainCtx={updateMainCtx}
            create={CreateFile}
            view={ViewFile}
            edit={EditFile}
        />
    )
}
