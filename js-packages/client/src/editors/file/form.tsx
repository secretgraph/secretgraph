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
import { hashTagsContentHash } from '@secretgraph/misc/utils/hashing'
import { findWorkingAlgorithms } from '@secretgraph/misc/utils/crypto'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import { extractGroupKeys } from '@secretgraph/misc/utils/references'
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import FormikCheckboxWithLabel from '@secretgraph/ui-components/formik/FormikCheckboxWithLabel'
import FormikTextField from '@secretgraph/ui-components/formik/FormikTextField'
import SimpleSelect from '@secretgraph/ui-components/forms/SimpleSelect'
import StateSelect from '@secretgraph/ui-components/forms/StateSelect'
import SunEditor from '@secretgraph/ui-components/SunEditor'
import UploadButton from '@secretgraph/ui-components/UploadButton'
import * as DOMPurify from 'dompurify'
import {
    ErrorMessage,
    FastField,
    Field,
    FieldArray,
    FieldArrayRenderProps,
    FieldProps,
    Form,
    Formik,
} from 'formik'
import * as React from 'react'

import ActionsDialog from '../../components/ActionsDialog'
import ClusterSelectViaUrl from '../../components/formsWithContext/ClusterSelectViaUrl'
import SimpleShareDialog from '../../components/share/SimpleShareDialog'
import * as Contexts from '../../contexts'
import { mappersToArray } from '../../hooks'
import { Recorder, TextFileAdapter, ViewWidget, htmlIsEmpty } from './misc'

export interface FileInternProps {
    disabled?: boolean
    viewOnly?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithms: string[]
    nodeData?: any
    tags?: { [name: string]: string[] }
    data?: Blob | null
    url: string
}

export function InnerFile({
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

    const actions = mappersToArray([mapper], { lockExisting: !!mainCtx.item })
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
                        plainInput: data
                            ? ''
                            : mainCtx.cloneData?.plainInput || '',
                        htmlInput: data
                            ? ''
                            : mainCtx.cloneData?.htmlInput || '',
                        // when viewing existing data: fileInput is used
                        fileInput: data
                            ? data
                            : mainCtx.cloneData?.fileInput || null,
                        state,
                        name,
                        encryptName,
                        keywords:
                            tags?.keywords ||
                            mainCtx.cloneData?.keywords ||
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
                        value: value.arrayBuffer(),
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
                        signatureAlgorithm: hashAlgorithm,
                        encryptionAlgorithm: hashAlgorithm,
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
                                        type="checkbox"
                                        Label={{
                                            label: 'Encrypt Name',
                                        }}
                                        disabled={
                                            isSubmitting ||
                                            values.state == 'public' ||
                                            disabled
                                        }
                                    />
                                    <Field
                                        name="uniqueName"
                                        component={FormikCheckboxWithLabel}
                                        type="checkbox"
                                        Label={{
                                            label: 'Unique Name',
                                        }}
                                        disabled={isSubmitting || disabled}
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
                                                        <ErrorMessage
                                                            name={
                                                                formikFieldProps
                                                                    .field.name
                                                            }
                                                            render={(
                                                                error
                                                            ) => (
                                                                <Typography color="error">
                                                                    {error}
                                                                </Typography>
                                                            )}
                                                        ></ErrorMessage>
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
                                {({
                                    remove,
                                    replace,
                                    push,
                                    form,
                                }: FieldArrayRenderProps) => {
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
