import { useApolloClient, useQuery } from '@apollo/client'
import Button from '@material-ui/core/Button'
import Checkbox from '@material-ui/core/Checkbox'
import FormControlLabel from '@material-ui/core/FormControlLabel'
import Grid from '@material-ui/core/Grid'
import LinearProgress from '@material-ui/core/LinearProgress'
import { Theme } from '@material-ui/core/styles'
import { useTheme } from '@material-ui/core/styles'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import Tooltip from '@material-ui/core/Tooltip'
import Typography from '@material-ui/core/Typography'
import CloudDownloadIcon from '@material-ui/icons/CloudDownload'
import Autocomplete from '@material-ui/lab/Autocomplete'
import {
    FastField,
    Field,
    FieldProps,
    Form,
    Formik,
    useFormikContext,
} from 'formik'
import * as React from 'react'

import FormikTextField from '../components/formik/FormikTextField'
import ClusterSelect from '../components/forms/ClusterSelect'
import SimpleSelect from '../components/forms/SimpleSelect'
import * as Contexts from '../contexts'
import { newClusterLabel } from '../messages'
import {
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '../queries/content'
import {
    ActionInputEntry,
    CertificateInputEntry,
    generateActionMapper,
    transformActions,
} from '../utils/action'
import { extractAuthInfo } from '../utils/config'
import { extractPrivKeys } from '../utils/config'
import {
    findWorkingHashAlgorithms,
    serializeToBase64,
} from '../utils/encryption'
import { extractPubKeysCluster } from '../utils/graphql'
import {
    createContent,
    decryptContentObject,
    updateContent,
} from '../utils/operations'
import { UnpackPromise } from '../utils/typing'

interface CustomInternProps {
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    nodeData?: any
    tags?: { [name: string]: string[] }
    data?: ArrayBuffer | null
    text?: string
    setCluster: (arg: string) => void
    url: string
    encryptedTags: string[]
    setEncryptedTags: (arg: string[]) => void
    viewOnly?: boolean
}
const InnerCustom = ({
    encryptedTags,
    setEncryptedTags,
    setCluster,
    url,
    nodeData,
    tags,
    data,
    text,
    disabled,
    hashAlgorithm,
    viewOnly,
}: CustomInternProps) => {
    disabled = disabled || viewOnly
    const theme = useTheme()
    const client = useApolloClient()
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { isSubmitting, dirty, submitForm } = useFormikContext()

    const initialValues = {
        tags: [] as string[],
        content: text !== undefined ? text : null,
        cluster: nodeData.cluster.id,
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
            onSubmit={async (values) => {
                const value: Blob | undefined = values.content
                    ? new Blob([values.content])
                    : undefined
                const authinfo = extractAuthInfo({
                    config,
                    clusters: new Set([values.cluster, nodeData.cluster.id]),
                    url,
                    require: new Set(['update']),
                })
                const pubkeysResult = await client.query({
                    fetchPolicy: 'network-only',
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.tokens,
                        id: mainCtx.item,
                    },
                })
                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url: url,
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
                    updateId: nodeData.updateId,
                    client,
                    config,
                    cluster: values.cluster, // can be null for keeping cluster
                    value,
                    tags: values.tags,
                    encryptTags: new Set(encryptedTags),
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

                updateMainCtx({
                    item: result.data.updateOrCreateContent.content.id,
                    updateId:
                        result.data.updateOrCreateContent.content.updateId,
                    url,
                    action: 'update',
                })
            }}
        >
            {({ values }) => {
                React.useEffect(() => {
                    setCluster(values.cluster)
                }, [values.cluster])
                return (
                    <Form>
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <Typography>Active Url</Typography>
                                <Typography>{url}</Typography>
                            </Grid>
                            <Grid item xs={12} md={4}>
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
                            <Grid item xs={12} md={4}>
                                <FastField
                                    component={ClusterSelect}
                                    url={url}
                                    name="cluster"
                                    disabled={disabled || isSubmitting}
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
                                <Autocomplete
                                    multiple
                                    options={encryptedTags}
                                    renderInput={(params) => {
                                        return (
                                            <TextField
                                                {...params}
                                                label="Encrypted Tagprefixes"
                                                fullWidth
                                                disabled={
                                                    disabled || isSubmitting
                                                }
                                                variant="outlined"
                                                helperText="Prefixes of the tags which should be encrypted (e.g. ename=, mime=)"
                                            />
                                        )
                                    }}
                                    onChange={(ev, val) => {
                                        setEncryptedTags(val)
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FastField
                                    component={FormikTextField}
                                    name="content"
                                    disabled={disabled || isSubmitting}
                                    label="Content"
                                    multiline
                                    fullWidth
                                    variant="outlined"
                                />
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
    const { mainCtx } = React.useContext(Contexts.Main)
    const [cluster, setCluster] = React.useState<string | null>(null)
    const [data, setData] =
        React.useState<
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
    const [encryptedTags, setEncryptedTags] = React.useState<string[]>([
        'ename',
        'mime',
    ])

    const authinfo = React.useMemo(
        () =>
            extractAuthInfo({
                config,
                url: mainCtx.url as string,
            }),
        [mainCtx.url, config]
    )
    let {
        data: dataUnfinished,
        loading,
        refetch,
    } = useQuery(contentRetrievalQuery, {
        pollInterval: 60000,
        fetchPolicy: 'cache-and-network',
        variables: {
            variables: {
                id: mainCtx.item as string,
                authorization: authinfo.tokens,
            },
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
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            if (!cluster) {
                if (!dataUnfinished.secretgraph.node.cluster.id) {
                    throw Error('no cluster found')
                }
                setCluster(dataUnfinished.secretgraph.node.cluster.id)
            }
            const hashAlgorithm = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )[0]

            const mapper = generateActionMapper({
                nodeData: dataUnfinished.secretgraph.node,
                config,
                knownHashes: [
                    dataUnfinished.secretgraph.node.cluster.availableActions,
                    dataUnfinished.secretgraph.node.availableActions,
                ],
                hashAlgorithm,
            })
            const res = await decryptContentObject({
                config,
                nodeData: dataUnfinished.secretgraph.node,
                blobOrTokens: authinfo.tokens,
                decrypt: new Set(encryptedTags),
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
    }, [dataUnfinished, ...encryptedTags])
    if (!data) {
        return null
    }
    return (
        <InnerCustom
            {...data}
            setCluster={setCluster}
            encryptedTags={encryptedTags}
            setEncryptedTags={setEncryptedTags}
            disabled={loading}
            viewOnly={viewOnly}
        />
    )
}
const AddCustom = () => {
    const theme = useTheme()
    const client = useApolloClient()
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const [cluster, setCluster] = React.useState<string | null>(
        searchCtx.cluster
    )
    const [encryptedTags, setEncryptedTags] = React.useState<string[]>([
        'ename',
        'mime',
    ])
    const [data, setData] =
        React.useState<{
            text: string
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
            id: cluster || '',
            authorization: [
                ...new Set([
                    ...mainCtx.tokens,
                    ...(cluster
                        ? extractAuthInfo({
                              config,
                              url: activeUrl,
                              clusters: new Set([cluster]),
                          }).tokens
                        : []),
                ]),
            ],
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (cluster) {
            loading = true
            refetch()
        }
    }, [cluster])

    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            if (!cluster) {
                if (!dataUnfinished.secretgraph.node.cluster.id) {
                    throw Error('no cluster found')
                }
                setCluster(dataUnfinished.secretgraph.node.cluster.id)
            }
            const hashAlgorithm = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )[0]

            const mapper = generateActionMapper({
                nodeData: dataUnfinished.secretgraph.node,
                config,
                knownHashes: [
                    dataUnfinished.secretgraph.node.cluster.availableActions,
                    dataUnfinished.secretgraph.node.availableActions,
                ],
                hashAlgorithm,
            })
            const res = await decryptContentObject({
                config,
                nodeData: dataUnfinished.secretgraph.node,
                blobOrTokens: mainCtx.tokens,
                decrypt: new Set(encryptedTags),
            })
            if (res) {
                setData({
                    ...res,
                    text: await new Blob([res.data]).text(),
                    key: `${new Date().getTime()}`,
                    hashAlgorithm: findWorkingHashAlgorithms(
                        dataUnfinished.secretgraph.config.hashAlgorithms
                    )[0],
                    url: activeUrl,
                    mapper: await mapper,
                })
            }
        }
        f()
    }, [dataUnfinished, ...encryptedTags])
    if (!data) {
        return null
    }
    return (
        <InnerCustom
            {...data}
            setCluster={setCluster}
            encryptedTags={encryptedTags}
            setEncryptedTags={setEncryptedTags}
            disabled={loading}
        />
    )
}
const ViewCustom = () => {
    const theme = useTheme()
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
    } else if (mainCtx.action == 'add') {
        return <AddCustom />
    }
    return null
}
