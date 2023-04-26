import { useQuery } from '@apollo/client'
import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import Security from '@mui/icons-material/Security'
import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel from '@mui/lab/TabPanel'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import Box from '@mui/system/Box'
import {
    contentFeedQuery,
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise } from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import {
    findWorkingHashAlgorithms,
    hashTagsContentHash,
} from '@secretgraph/misc/utils/hashing'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import { extractGroupKeys } from '@secretgraph/misc/utils/references'
import * as DOMPurify from 'dompurify'
import { FastField, Field, FieldArray, FieldProps, Form, Formik } from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import DecisionFrame from '../components/DecisionFrame'
import FormikCheckboxWithLabel from '../components/formik/FormikCheckboxWithLabel'
import FormikTextField from '../components/formik/FormikTextField'
import SimpleSelect from '../components/forms/SimpleSelect'
import StateSelect from '../components/forms/StateSelect'
import ClusterSelectViaUrl from '../components/formsWithContext/ClusterSelectViaUrl'
import SimpleShareDialog from '../components/share/SimpleShareDialog'
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

const Recorder = function Recorder() {
    const [useAudio, setUseAudio] = React.useState(true)
    const [useVideo, setUseVideo] = React.useState(true)
    const [recording, setRecording] = React.useState(false)

    return (
        <>
            <Box />
            <Stack direction="row">
                <FormControlLabel
                    control={<Checkbox disabled={recording} />}
                    onChange={(ev, checked) => setUseAudio(checked)}
                    label="audio"
                />
                <FormControlLabel
                    control={<Checkbox disabled={recording} />}
                    onChange={(ev, checked) => setUseVideo(checked)}
                    label="video"
                />
            </Stack>

            <Stack direction="row">
                <Button disabled={recording}>Start Recording</Button>
                <Button disabled={!recording}>Pause Recording</Button>
                <Button disabled={!recording}>Stop Recording</Button>
            </Stack>
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
                    onChange(
                        new Blob([ev.currentTarget.value], { type: mime })
                    )
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
}

function InnerFile({
    disabled,
    nodeData,
    tags,
    data,
    mapper,
    url,
    hashAlgorithms,
    viewOnly,
}: FileInternProps) {
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
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
    // const [PSelections, setPSelections] = React.useState<string[]>([])
    let name: string = mainCtx.cloneData?.name || ''

    const actions = mapperToArray(mapper, { lockExisting: !!mainCtx.item })
    let encryptName =
        mainCtx.cloneData?.encryptName !== undefined
            ? mainCtx.cloneData.encryptName
            : true
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
    const state =
        nodeData?.state ||
        (mainCtx.cloneData && mainCtx.cloneData.state) ||
        'protected'
    if (state == 'public') {
        encryptName = false
    }
    //
    return (
        <>
            <SimpleShareDialog
                shareUrl={
                    nodeData?.link
                        ? new URL(nodeData?.link, mainCtx.url as string).href
                        : undefined
                }
                isPublic={state == 'public'}
                actions={actions}
                hashAlgorithm={hashAlgorithms[0]}
            />
            <Formik
                initialValues={
                    {
                        plainInput:
                            (mainCtx.cloneData &&
                                mainCtx.cloneData.plainInput) ||
                            '',
                        htmlInput:
                            (mainCtx.cloneData &&
                                mainCtx.cloneData.htmlInput) ||
                            '',
                        // when viewing existing data: fileInput is used
                        fileInput: data
                            ? data
                            : (mainCtx.cloneData &&
                                  mainCtx.cloneData.fileInput) ||
                              null,
                        state,
                        name,
                        encryptName,
                        keywords:
                            tags?.keywords ||
                            (mainCtx.cloneData &&
                                mainCtx.cloneData.keywords) ||
                            [],
                        cluster: mainCtx.editCluster || null,
                        actions,
                        uniqueName: nodeData
                            ? !!nodeData.contentHash
                            : mainCtx.cloneData
                            ? mainCtx.cloneData.uniqueName
                            : true,
                    } as {
                        plainInput: string
                        htmlInput: string
                        fileInput: Blob | File | null
                        state: string
                        name: string
                        encryptName: boolean
                        uniqueName: boolean
                        keywords: string[]
                        cluster: string
                        actions: typeof actions
                    }
                }
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
                        value = new Blob([values.htmlInput], {
                            type: 'text/html',
                        })
                    } else {
                        throw Error('no input found')
                    }
                    if (!values.cluster) {
                        throw Error('Cluster not set')
                    }
                    const tags: string[] = [`mime=${value.type}`]
                    if (values.name) {
                        tags.push(
                            !values.encryptName || values.state == 'public'
                                ? `name=${values.name}`
                                : `~name=${values.name}`
                        )
                    }
                    tags.push(
                        ...values.keywords.map((val) => `keyword=${val}`)
                    )

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
                        contentHash:
                            values.uniqueName && values.name
                                ? await hashTagsContentHash(
                                      [`name=${values.name}`],
                                      'File',
                                      hashAlgorithm
                                  )
                                : undefined,
                        type: value.type.startsWith('text/') ? 'Text' : 'File',
                        tags,
                        id: nodeData?.id,
                        updateId: nodeData?.updateId,
                        url,
                        hashAlgorithm,
                    })
                    await itemClient.refetchQueries({
                        include: [contentRetrievalQuery, contentFeedQuery],
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
                            updateConfig(res.config, true)
                            updateMainCtx({
                                item: res.node.id,
                                updateId: res.node.updateId,
                                url,
                                action: 'update',
                                tokens: [
                                    ...new Set([
                                        ...mainCtx.tokens,
                                        ...nTokens,
                                    ]),
                                ],
                                editCluster: values.cluster,
                                currentCluster: values.cluster,
                                cloneData: null,
                            })
                        } else {
                            updateMainCtx({
                                item: res.node.id,
                                updateId: res.node.updateId,
                                url,
                                action: 'update',
                                cloneData: null,
                                editCluster: values.cluster,
                                currentCluster: values.cluster,
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
                    dirty,
                    setFieldTouched,
                    touched,
                    setFieldValue,
                }) => {
                    let updateCloneData = true
                    React.useEffect(() => {
                        if (values.state == 'public') {
                            setFieldValue('encryptName', false)
                            // will be rerendered
                            updateCloneData = false
                        }
                    }, [values.state])
                    React.useEffect(() => {
                        if (updateCloneData) {
                            updateMainCtx({
                                cloneData:
                                    mainCtx.action == 'create'
                                        ? values
                                        : {
                                              name: values.name,
                                              encryptName: values.encryptName,
                                              uniqueName: values.uniqueName,
                                          },
                                currentCluster: values.cluster,
                                editCluster: values.cluster,
                            })
                        }
                    }, [values])
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
                            <Grid xs={12}>
                                <Stack
                                    direction="row"
                                    justifyContent="start"
                                    spacing={1}
                                >
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
                                    <Field
                                        name="encryptName"
                                        component={FormikCheckboxWithLabel}
                                        Label={{
                                            label: 'Encrypt Name',
                                        }}
                                        disabled={
                                            isSubmitting ||
                                            values.state == 'public' ||
                                            disabled
                                        }
                                        type="checkbox"
                                    />
                                    <Field
                                        name="uniqueName"
                                        component={FormikCheckboxWithLabel}
                                        Label={{
                                            label: 'Unique Name',
                                        }}
                                        disabled={
                                            isSubmitting ||
                                            values.state == 'public' ||
                                            disabled
                                        }
                                        type="checkbox"
                                    />
                                    {viewOnly ? null : (
                                        <Tooltip title="Actions">
                                            <span>
                                                <IconButton
                                                    onClick={() =>
                                                        updateMainCtx({
                                                            openDialog:
                                                                'actions',
                                                        })
                                                    }
                                                    size="large"
                                                >
                                                    <Security />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    )}
                                </Stack>
                            </Grid>

                            <Grid xs={12} md={6}>
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
                            <Grid xs={12} md={6}>
                                <FastField
                                    component={ClusterSelectViaUrl}
                                    url={url}
                                    name="cluster"
                                    disabled={isSubmitting || disabled}
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
                            <Grid xs={12}>
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
                                    <Grid xs={12}>
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
                                                        label="Record"
                                                        value="record"
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
                                                                    minRows={
                                                                        10
                                                                    }
                                                                    onChange={(
                                                                        ev
                                                                    ) => {
                                                                        formikFieldProps.form.setFieldValue(
                                                                            'htmlInput',
                                                                            ev
                                                                                .target
                                                                                .value
                                                                        )
                                                                        formikFieldProps.form.setFieldTouched(
                                                                            'htmlInput',
                                                                            true
                                                                        )
                                                                        setFieldValue(
                                                                            'fileInput',
                                                                            null
                                                                        )
                                                                        setFieldTouched(
                                                                            'fileInput',
                                                                            false
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
                                            <TabPanel value="record">
                                                <Recorder />
                                            </TabPanel>
                                        </TabContext>
                                    </Grid>
                                    <Grid xs={12}>
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
                                            {(
                                                formikFieldProps: FieldProps
                                            ) => {
                                                return (
                                                    <>
                                                        <Stack
                                                            spacing={1}
                                                            direction="row"
                                                        >
                                                            <UploadButton
                                                                name="fileInput"
                                                                onChange={(
                                                                    ev
                                                                ) => {
                                                                    if (
                                                                        ev
                                                                            .target
                                                                            .files &&
                                                                        ev
                                                                            .target
                                                                            .files
                                                                            .length >
                                                                            0
                                                                    ) {
                                                                        /**setPSelections([
                                                                ev.target.files[0]
                                                                    .name,
                                                            ])*/
                                                                        if (
                                                                            !touched.name
                                                                        ) {
                                                                            setFieldValue(
                                                                                'name',
                                                                                ev
                                                                                    .target
                                                                                    .files[0]
                                                                                    .name
                                                                            )
                                                                        }
                                                                        setFieldValue(
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
                                                                        setFieldValue(
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
                                                                    setFieldValue(
                                                                        'fileInput',
                                                                        null
                                                                    )
                                                                    setFieldTouched(
                                                                        'fileInput',
                                                                        false
                                                                    )
                                                                }}
                                                            >
                                                                Clear
                                                            </Button>
                                                        </Stack>

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

                            <Grid xs={12}>
                                {isSubmitting && <LinearProgress />}
                            </Grid>
                            <Grid xs={12}>
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
                                            hashAlgorithm={hashAlgorithms[0]}
                                            remove={remove}
                                            replace={replace}
                                            push={push}
                                            form={form}
                                            disabled={isSubmitting || disabled}
                                            handleClose={() =>
                                                updateMainCtx({
                                                    openDialog: null,
                                                })
                                            }
                                            open={
                                                mainCtx.openDialog == 'actions'
                                            }
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
                                                    xs
                                                    style={{
                                                        whiteSpace: 'normal',
                                                    }}
                                                >
                                                    {name}
                                                </Grid>

                                                <Grid xs="auto">
                                                    <Tooltip title="Actions">
                                                        <span>
                                                            <IconButton
                                                                onClick={() =>
                                                                    updateMainCtx(
                                                                        {
                                                                            openDialog:
                                                                                'actions',
                                                                        }
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
            dataUnfinished.secretgraph.node.cluster.id != mainCtx.editCluster
        ) {
            loading = true
            refetch()
        }
    }, [mainCtx.editCluster])
    React.useEffect(() => {
        if (!dataUnfinished || loading) {
            return
        }
        if (!dataUnfinished.secretgraph.node) {
            console.log('empty node, permissions?')
            return
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
                readonly:
                    dataUnfinished.secretgraph.node.tags.includes('immutable'),
                shareFn: () => updateMainCtx({ openDialog: 'share' }),
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

            let obj
            try {
                obj = await decryptContentObject({
                    config,
                    nodeData: dataUnfinished.secretgraph.node,
                    blobOrTokens: mainCtx.tokens,
                    itemDomain: mainCtx.url || '/',
                })
            } catch (exc) {
                if (!active) {
                    return
                }
                throw exc
            }
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
        <InnerFile
            {...data}
            url={mainCtx.url as string}
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
                id: mainCtx.editCluster || Constants.stubCluster,
                authorization: mainCtx.tokens,
            },
            onError: console.error,
        }
    )

    React.useEffect(() => {
        if (dataUnfinished) {
            refetch()
        }
    }, [mainCtx.editCluster, activeUrl])

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

    return <InnerFile url={activeUrl} {...data} />
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
