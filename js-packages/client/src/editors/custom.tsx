import { useQuery } from '@apollo/client'
import FlagIcon from '@mui/icons-material/Flag'
import LockIcon from '@mui/icons-material/Lock'
import MoreIcon from '@mui/icons-material/More'
import SecurityIcon from '@mui/icons-material/Security'
import { InputAdornment } from '@mui/material'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
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
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/hashing'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import FormikTextField from '@secretgraph/ui-components/formik/FormikTextField'
import StateSelect from '@secretgraph/ui-components/forms/StateSelect'
import UploadButton from '@secretgraph/ui-components/UploadButton'
import {
    FastField,
    Field,
    FieldArray,
    FieldArrayRenderProps,
    FieldProps,
    Form,
    Formik,
} from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import ClusterSelectViaUrl from '../components/formsWithContext/ClusterSelectViaUrl'
import * as Contexts from '../contexts'
import { mapperToArray } from '../hooks'

interface InnerCustomProps {
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    nodeData?: any
    tags?: { [name: string]: string[] }
    text?: string
    url: string
    viewOnly?: boolean
}
const InnerCustom = ({
    url,
    nodeData,
    tags,
    mapper,
    text = '',
    disabled,
    hashAlgorithm,
    viewOnly,
}: InnerCustomProps) => {
    disabled = disabled || viewOnly

    const [open, setOpen] = React.useState(false)
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const actions = mapperToArray(mapper, { lockExisting: !!mainCtx.item })

    const initialValues = {
        tags: [] as string[],
        text,
        state: nodeData?.state || 'protected',
        contentHash: nodeData?.contentHash || '',
        type: nodeData?.type || '',
        actions,
        cluster: mainCtx.editCluster,
    }
    for (const [prefix, vals] of Object.entries(tags || {})) {
        if (vals.length) {
            for (const tag of vals) {
                initialValues.tags.push(`${prefix}=${tag}`)
            }
        } else {
            initialValues.tags.push(prefix)
        }
    }
    initialValues.tags.push('')
    return (
        <Formik
            initialValues={initialValues}
            onSubmit={async (values, { setSubmitting }) => {
                if (!values.cluster) {
                    throw Error('Cluster not set')
                }
                const value = new Blob([values.text])
                const res = await updateOrCreateContentWithConfig({
                    actions: values.actions,
                    config,
                    mapper,
                    cluster: values.cluster,
                    value,
                    itemClient,
                    baseClient,
                    authorization: mainCtx.tokens,
                    state: values.state,
                    type: values.type,
                    tags: values.tags.filter((val) => val),
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
                                ...new Set([...mainCtx.tokens, ...nTokens]),
                            ],
                            editCluster: values.cluster,
                            currentCluster: values.cluster,
                        })
                    } else {
                        updateMainCtx({
                            item: res.node.id,
                            updateId: res.node.updateId,
                            url,
                            action: 'update',
                            editCluster: values.cluster,
                            currentCluster: values.cluster,
                        })
                    }
                } else {
                    setSubmitting(false)
                }
            }}
        >
            {({ values, isSubmitting, dirty, submitForm, setFieldValue }) => {
                React.useEffect(() => {
                    values.cluster &&
                        updateMainCtx({ editCluster: values.cluster })
                }, [values.cluster])
                const updateTags = React.useCallback((tags: string[]) => {
                    const ntags = tags.filter((val) => val)
                    ntags.sort()
                    if (ntags[ntags.length - 1] != '') {
                        ntags.push('')
                    }
                    setFieldValue('tags', ntags)
                }, [])
                const effectTags = values.tags.filter((val) =>
                    val.match(/^~?name=/)
                )
                effectTags.sort()
                React.useEffect(() => {
                    let name: string = mainCtx.item || ''
                    const match = values.tags.find((val) =>
                        val.match(/^~?name=/)
                    )
                    if (match) {
                        name = match.replace(/^~?name=/, '')
                    }
                    updateMainCtx({ title: name })
                }, [effectTags.join('')])
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
                                        remove={remove}
                                        replace={replace}
                                        push={push}
                                        form={form}
                                        disabled={isSubmitting || disabled}
                                        handleClose={() => setOpen(false)}
                                        open={open}
                                        isContent
                                        isPublic={values.state == 'public'}
                                        hashAlgorithm={hashAlgorithm}
                                    />
                                )
                            }}
                        </FieldArray>
                        <Grid container spacing={2}>
                            <Grid xs={11}>
                                <Typography>Active Url</Typography>
                                <Typography>{url}</Typography>
                            </Grid>

                            <Grid xs>
                                <Tooltip title="Actions">
                                    <span>
                                        <IconButton
                                            onClick={() => setOpen(!open)}
                                            size="large"
                                        >
                                            <SecurityIcon />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Grid>
                            <Grid xs={12}>
                                <Field
                                    component={FormikTextField}
                                    name="type"
                                    fullWidth
                                    disabled={
                                        disabled || isSubmitting || !!nodeData
                                    }
                                    label="Type"
                                />
                            </Grid>
                            <Grid xs={12} md={6}>
                                <Field
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
                                <Field
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
                                <Field
                                    component={FormikTextField}
                                    name="contentHash"
                                    disabled={disabled || isSubmitting}
                                    label="ContentHash"
                                    fullWidth
                                    variant="outlined"
                                    validate={(val: string) => {
                                        if (
                                            val &&
                                            !val.match(
                                                `^[^:]*:${Constants.mapHashNames[hashAlgorithm].serializedName}:[a-zA-Z0-9+/]+={0,2}$`
                                            )
                                        ) {
                                            return 'invalid ContentHash'
                                        } else {
                                            return null
                                        }
                                    }}
                                />
                            </Grid>
                            <Grid xs={12}>
                                <Box
                                    sx={{
                                        padding: (theme) =>
                                            theme.spacing(2, 0, 4, 0),
                                    }}
                                >
                                    <Typography variant="h4">Tags</Typography>
                                    {values.tags.map(
                                        (tag: string, index: number) => (
                                            <Field
                                                name={`tags[${index}]`}
                                                key={index}
                                            >
                                                {(
                                                    formikFieldProps: FieldProps
                                                ) => {
                                                    let icon = null
                                                    if (
                                                        formikFieldProps.field.value.startsWith(
                                                            '~'
                                                        )
                                                    ) {
                                                        icon = (
                                                            <Tooltip title="Encrypted tag">
                                                                <InputAdornment position="start">
                                                                    <LockIcon />
                                                                </InputAdornment>
                                                            </Tooltip>
                                                        )
                                                    } else if (
                                                        formikFieldProps.field.value.indexOf(
                                                            '='
                                                        ) >= 0
                                                    ) {
                                                        icon = (
                                                            <Tooltip title="Unecrypted Tag">
                                                                <InputAdornment position="start">
                                                                    <MoreIcon />
                                                                </InputAdornment>
                                                            </Tooltip>
                                                        )
                                                    } else if (
                                                        tag.length > 0
                                                    ) {
                                                        icon = (
                                                            <Tooltip title="Flag">
                                                                <InputAdornment position="start">
                                                                    <FlagIcon />
                                                                </InputAdornment>
                                                            </Tooltip>
                                                        )
                                                    }
                                                    return (
                                                        <FormikTextField
                                                            {...formikFieldProps}
                                                            InputProps={{
                                                                startAdornment:
                                                                    icon,
                                                            }}
                                                            sx={{
                                                                paddingLeft: (
                                                                    theme
                                                                ) =>
                                                                    theme.spacing(
                                                                        2
                                                                    ),
                                                                marginTop: (
                                                                    theme
                                                                ) =>
                                                                    theme.spacing(
                                                                        2
                                                                    ),
                                                            }}
                                                            fullWidth
                                                            variant="filled"
                                                            disabled={
                                                                disabled ||
                                                                isSubmitting
                                                            }
                                                            onBlur={(ev) => {
                                                                updateTags(
                                                                    values.tags
                                                                )
                                                                formikFieldProps.field.onBlur(
                                                                    ev
                                                                )
                                                            }}
                                                            onKeyUp={(ev) => {
                                                                if (
                                                                    ev.code ===
                                                                    'Enter'
                                                                ) {
                                                                    updateTags(
                                                                        values.tags
                                                                    )
                                                                }
                                                            }}
                                                        />
                                                    )
                                                }}
                                            </Field>
                                        )
                                    )}
                                </Box>
                            </Grid>
                            <Grid xs={12}>
                                <Field
                                    component={FormikTextField}
                                    name="text"
                                    disabled={disabled || isSubmitting}
                                    label="Content"
                                    multiline
                                    minRows={5}
                                    fullWidth
                                    variant="outlined"
                                />
                            </Grid>
                            <Grid xs={12}>
                                <Field
                                    name="text"
                                    disabled={!!(isSubmitting || disabled)}
                                >
                                    {(formikFieldProps: FieldProps) => {
                                        return (
                                            <>
                                                <UploadButton
                                                    name="textbtn"
                                                    onChange={async (ev) => {
                                                        if (
                                                            ev.target.files &&
                                                            ev.target.files
                                                                .length > 0
                                                        ) {
                                                            formikFieldProps.form.setFieldValue(
                                                                'text',
                                                                await ev.target.files[0].text()
                                                            )

                                                            formikFieldProps.form.setFieldTouched(
                                                                'text',
                                                                true
                                                            )
                                                        } else {
                                                            formikFieldProps.form.setFieldValue(
                                                                'text',
                                                                ''
                                                            )
                                                            formikFieldProps.form.setFieldTouched(
                                                                'text',
                                                                false
                                                            )
                                                        }
                                                    }}
                                                >
                                                    <Button
                                                        variant="contained"
                                                        color="primary"
                                                        component="span"
                                                        disabled={
                                                            !!(
                                                                isSubmitting ||
                                                                disabled
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
                                                            disabled
                                                        )
                                                    }
                                                    onClick={() => {
                                                        formikFieldProps.form.setFieldValue(
                                                            'content',
                                                            ''
                                                        )
                                                        formikFieldProps.form.setFieldTouched(
                                                            'content',
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
                            <Grid xs={12}>
                                {isSubmitting && <LinearProgress />}
                            </Grid>
                            {!viewOnly && (
                                <Grid xs={12}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        disabled={
                                            disabled || isSubmitting || !dirty
                                        }
                                        onClick={submitForm}
                                    >
                                        Submit
                                    </Button>
                                </Grid>
                            )}
                        </Grid>
                    </Form>
                )
            }}
        </Formik>
    )
}

const EditCustom = ({ viewOnly }: { viewOnly?: boolean }) => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<
        | (Exclude<
              UnpackPromise<ReturnType<typeof decryptContentObject>>,
              null
          > & {
              text: string
              key: string
              hashAlgorithm: string
              url: string
              mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
          })
        | null
    >(null)

    let {
        data: dataUnfinished,
        loading,
        refetch,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
        },
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
        if (!dataUnfinished) {
            return
        }
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
            setData({
                ...obj,
                text: await new Blob([obj.data]).text(),
                key: `${new Date().getTime()}`,
                hashAlgorithm: hashAlgorithms[0],
                url: mainCtx.url as string,
                mapper: await mapper,
            })
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return <InnerCustom {...data} disabled={loading} viewOnly={viewOnly} />
}
const CreateCustom = () => {
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<{
        key: string
        hashAlgorithm: string
        url: string
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    } | null>(null)
    let {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(getContentConfigurationQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.editCluster || Constants.stubCluster,
            authorization: mainCtx.tokens,
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (mainCtx.editCluster) {
            loading = true
            refetch()
        }
    }, [mainCtx.editCluster])

    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        let active = true
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            updateMainCtx({
                deleted: false,
                updateId: null,
            })
            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )

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
            if (!active) {
                return
            }
            setData({
                key: `${new Date().getTime()}`,
                hashAlgorithm: hashAlgorithms[0],
                url: activeUrl,
                mapper: mapper,
            })
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return <InnerCustom {...data} disabled={loading} />
}
const ViewCustom = () => {
    return <EditCustom viewOnly />
}

export default function CustomComponent() {
    const { mainCtx } = React.useContext(Contexts.Main)
    // we cannot provide a fallback to switch to custom because we are in the custom path
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            create={CreateCustom}
            view={ViewCustom}
            edit={EditCustom}
        />
    )
}
