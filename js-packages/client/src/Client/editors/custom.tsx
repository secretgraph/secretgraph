import { useApolloClient, useQuery } from '@apollo/client'
import SecurityIcon from '@mui/icons-material/Security'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import { Theme } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import { UnpackPromise } from '@secretgraph/misc/typing'
import {
    ActionInputEntry,
    CertificateInputEntry,
    generateActionMapper,
    transformActions,
} from '@secretgraph/misc/utils/action'
import { saveConfig } from '@secretgraph/misc/utils/config'
import {
    authInfoFromConfig,
    extractPrivKeys,
} from '@secretgraph/misc/utils/config'
import { extractPubKeysCluster } from '@secretgraph/misc/utils/graphql'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/hashing'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import { FastField, Field, FieldArray, FieldProps, Form, Formik } from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import FormikTextField from '../components/formik/FormikTextField'
import ClusterSelect from '../components/forms/ClusterSelect'
import SimpleSelect from '../components/forms/SimpleSelect'
import StateSelect from '../components/forms/StateSelect'
import UploadButton from '../components/UploadButton'
import * as Contexts from '../contexts'
import { mapperToArray } from '../hooks'
import { newClusterLabel } from '../messages'

interface CustomInternProps {
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    nodeData?: any
    tags?: { [name: string]: string[] }
    text?: string
    tokens: string[]
    url: string
    viewOnly?: boolean
}
const InnerCustom = ({
    url,
    nodeData,
    tags,
    tokens,
    mapper,
    text = '',
    disabled,
    hashAlgorithm,
    viewOnly,
}: CustomInternProps) => {
    disabled = disabled || viewOnly

    const [open, setOpen] = React.useState(false)
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const actions = mapperToArray(mapper, { lockExisting: !!mainCtx.item })

    const clusterSelectTokens = React.useMemo(() => {
        return authInfoFromConfig({
            config,
            url,
            require: new Set(['create', 'manage']),
        }).tokens
    }, [config])

    const initialValues = {
        tags: [] as string[],
        text,
        state: nodeData?.state || 'internal',
        type: nodeData?.type || null,
        actions,
        cluster:
            nodeData?.cluster?.id ||
            (searchCtx.cluster ? searchCtx.cluster : null),
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
    return (
        <Formik
            initialValues={initialValues}
            onSubmit={async (values, { setSubmitting }) => {
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
                    tags: values.tags,
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
                            tokens: [...new Set(...mainCtx.tokens, ...nTokens)],
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
            {({ values, isSubmitting, dirty, submitForm }) => {
                React.useEffect(() => {
                    values.cluster && updateMainCtx({ cluster: values.cluster })
                }, [values.cluster])
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
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <Typography>Active Url</Typography>
                                <Typography>{url}</Typography>
                            </Grid>
                            <Grid item xs={12}>
                                <FastField
                                    component={SimpleSelect}
                                    name="type"
                                    disabled={disabled || isSubmitting}
                                    options={[]}
                                    label="Type"
                                    freeSolo
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
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
                            <Grid item xs={11} md={5}>
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
                            {viewOnly ? null : (
                                <Grid item xs="auto">
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
                            )}
                            <Grid item xs={12}>
                                <FastField
                                    component={SimpleSelect}
                                    name="tags"
                                    disabled={disabled || isSubmitting}
                                    options={[]}
                                    label="Tags"
                                    freeSolo
                                    multiple
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FastField
                                    component={FormikTextField}
                                    name="text"
                                    disabled={disabled || isSubmitting}
                                    label="Content"
                                    multiline
                                    fullWidth
                                    variant="outlined"
                                />
                            </Grid>
                            <Grid item xs={12}>
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
                            <Grid item xs={12}>
                                {isSubmitting && <LinearProgress />}
                            </Grid>
                            {!viewOnly && (
                                <Grid item xs={12}>
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
    const theme = useTheme()
    const client = useApolloClient()
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

    const authorization = React.useMemo(() => {
        const authinfo = authInfoFromConfig({
            config,
            url: mainCtx.url as string,
            clusters: new Set([
                ...(mainCtx.cluster ? [mainCtx.cluster] : []),
                ...(data?.nodeData?.cluster ? [data?.nodeData?.cluster] : []),
            ]),
            require: viewOnly ? undefined : new Set(['update', 'manage']),
        })
        return [...new Set([...mainCtx.tokens, ...authinfo.tokens])]
    }, [mainCtx.url, config, mainCtx.tokens])

    let {
        data: dataUnfinished,
        loading,
        refetch,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.item as string,
            authorization,
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
            dataUnfinished.secretgraph.node.cluster.id != mainCtx.cluster
        ) {
            loading = true
            refetch()
        }
    }, [mainCtx.cluster])
    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        const f = async () => {
            if (!dataUnfinished) {
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
            const hashAlgorithm = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )[0]

            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const contentstuff =
                host && host.contents[dataUnfinished.secretgraph.node.id]
            const mapper = generateActionMapper({
                config,
                knownHashesContent: [
                    dataUnfinished.secretgraph.node.availableActions,
                    contentstuff?.hashes,
                ],
                knownHashesCluster: [
                    dataUnfinished.secretgraph.node.cluster?.availableActions,
                    contentstuff &&
                        host?.clusters[contentstuff.cluster]?.hashes,
                ],
                hashAlgorithms:
                    dataUnfinished.secretgraph.config.hashAlgorithms,
            })
            const res = await decryptContentObject({
                config,
                nodeData: dataUnfinished.secretgraph.node,
                blobOrTokens: authorization,
            })
            if (res) {
                setData({
                    ...res,
                    text: await new Blob([res.data]).text(),
                    key: `${new Date().getTime()}`,
                    hashAlgorithm: findWorkingHashAlgorithms(
                        dataUnfinished.secretgraph.config.hashAlgorithms
                    )[0],
                    url: mainCtx.url as string,
                    mapper: await mapper,
                })
            }
        }
        f()
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return (
        <InnerCustom
            {...data}
            disabled={loading}
            viewOnly={viewOnly}
            tokens={authorization}
        />
    )
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
    const tokens = React.useMemo(
        () =>
            mainCtx.cluster
                ? authInfoFromConfig({
                      config,
                      url: activeUrl,
                      clusters: new Set([mainCtx.cluster]),
                      require: new Set(['create', 'manage']),
                  }).tokens
                : [],
        [config, mainCtx.cluster, activeUrl]
    )

    const authorization = React.useMemo(
        () => [...new Set([...mainCtx.tokens, ...tokens])],
        [tokens, mainCtx.tokens]
    )

    let {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(getContentConfigurationQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.cluster || Constants.stubCluster,
            authorization,
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (mainCtx.cluster) {
            loading = true
            refetch()
        }
    }, [mainCtx.cluster])

    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
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

            const mapper = generateActionMapper({
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
            setData({
                key: `${new Date().getTime()}`,
                hashAlgorithm: hashAlgorithms[0],
                url: activeUrl,
                mapper: await mapper,
            })
        }
        f()
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return <InnerCustom {...data} disabled={loading} tokens={authorization} />
}
const ViewCustom = () => {
    // list all tags
    // view content if possible
    // elsewise just download

    return <EditCustom viewOnly />
}

export default function CustomComponent() {
    const { mainCtx } = React.useContext(Contexts.Main)
    if (mainCtx.action == 'view' && mainCtx.item) {
        return <ViewCustom />
    } else if (mainCtx.action == 'update' && mainCtx.item) {
        return <EditCustom />
    } else if (mainCtx.action == 'create') {
        return <CreateCustom />
    }
    return null
}
