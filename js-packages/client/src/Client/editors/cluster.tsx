import {
    ApolloClient,
    FetchResult,
    useLazyQuery,
    useQuery,
} from '@apollo/client'
import { ListSubheader } from '@mui/material'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import {
    getClusterConfigurationQuery,
    getClusterQuery,
} from '@secretgraph/graphql-queries/cluster'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise, ValueType } from '@secretgraph/misc/typing'
import {
    ActionInputEntry,
    CertificateInputEntry,
    generateActionMapper,
    transformActions,
} from '@secretgraph/misc/utils/action'
import { extractNameNote } from '@secretgraph/misc/utils/cluster'
import { extractAuthInfo, saveConfig } from '@secretgraph/misc/utils/config'
import {
    findWorkingHashAlgorithms,
    hashObject,
    serializeToBase64,
    unserializeToArrayBuffer,
} from '@secretgraph/misc/utils/encryption'
import {
    createCluster,
    updateCluster,
    updateConfigRemoteReducer,
} from '@secretgraph/misc/utils/operations'
import * as SetOps from '@secretgraph/misc/utils/set'
import {
    ArrayHelpers,
    FastField,
    Field,
    FieldArray,
    Form,
    Formik,
    FormikProps,
} from 'formik'
import * as React from 'react'

import { ActionEntry } from '../components/ActionsDialog'
import DecisionFrame from '../components/DecisionFrame'
import FormikCheckboxWithLabel from '../components/formik/FormikCheckboxWithLabel'
import FormikTextField from '../components/formik/FormikTextField'
import * as Contexts from '../contexts'

async function extractCombinedInfo({
    config,
    node,
    url,
    tokens,
    hashAlgorithms,
}: {
    config: Interfaces.ConfigInterface
    node?: any
    url: string
    tokens: string[]
    hashAlgorithms: string[]
}) {
    const { name, note } = extractNameNote(node.description)
    const known = node && url && config.hosts[url]?.clusters[node.id]?.hashes
    const mapper = await generateActionMapper({
        config,
        unknownTokens: tokens,
        knownHashes: known
            ? [known, node.availableActions]
            : node?.availableActions,
        hashAlgorithms,
    })
    return {
        mapper,
        name: name || '',
        note: note || '',
        public: node.public,
        featured: node.featured,
        url,
        hashAlgorithm: hashAlgorithms[0],
    }
}

interface ClusterInternProps {
    readonly description?: string
    readonly name: string
    readonly note: string
    readonly featured?: boolean
    readonly public?: boolean
    url: string
    loading?: boolean
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    viewOnly?: boolean
}

const ClusterIntern = ({
    mapper,
    disabled,
    hashAlgorithm,
    loading: loadingIntern,
    url,
    viewOnly,
    ...props
}: ClusterInternProps) => {
    disabled = disabled || viewOnly
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { updateSearchCtx } = React.useContext(Contexts.Search)
    React.useLayoutEffect(() => {
        updateMainCtx({ title: props.name || '' })
    }, [props.name, props.note])

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
                        note: entry.note,
                        value: {
                            action: actionType,
                        },
                        update: entry.hasUpdate,
                        delete: false,
                        readonly: false,
                        locked: props.description !== undefined,
                    })
                }
            } else {
                actions.push({
                    type: 'certificate',
                    data: params.data,
                    newHash: params.newHash,
                    oldHash: params.oldHash || undefined,
                    note: entry.note,
                    update: entry.hasUpdate,
                    delete: false,
                    readonly: false,
                    locked: true,
                })
            }
        })
        return actions
    }, [mapper])
    const actionTokens = React.useMemo(
        () =>
            mapper
                ? actions
                      .filter((val) => val.type == 'action')
                      .map((val) => val.data)
                : mainCtx.tokens,
        [actions, mapper]
    )
    /**
    keyHash: string | null
    start: Date | null
    stop: Date | null
    note: string
    value: { [key: string]: any } & { action: string }
    update?: undefined | boolean
    delete: boolean
    readonly: boolean*/
    return (
        <Formik
            initialValues={{
                actions,
                name: props.name || '',
                note: props.note || '',
                featured: !!props.featured,
                public: !!props.public,
            }}
            onSubmit={async (
                { actions: actionsNew, name, note, ...values },
                { setSubmitting, resetForm }
            ) => {
                const description = [name, note].join('\u001F')
                let clusterResponse: FetchResult<any>
                const {
                    hashes,
                    actions: finishedActions,
                    configUpdate,
                } = await transformActions({
                    actions: actionsNew,
                    mapper,
                    hashAlgorithm,
                })
                let digestCert: undefined | string = undefined,
                    privPromise: undefined | Promise<string> = undefined
                if (mainCtx.item) {
                    clusterResponse = await updateCluster({
                        id: mainCtx.item as string,
                        client: itemClient,
                        updateId: mainCtx.updateId as string,
                        actions: finishedActions,
                        description,
                        authorization: mainCtx.tokens,
                        public: values.public,
                        featured: values.featured,
                    })
                } else {
                    const key = crypto.getRandomValues(new Uint8Array(32))
                    const { publicKey, privateKey } =
                        (await crypto.subtle.generateKey(
                            {
                                name: 'RSA-OAEP',
                                //modulusLength: 8192,
                                modulusLength: 2048,
                                publicExponent: new Uint8Array([1, 0, 1]),
                                hash: hashAlgorithm,
                            },
                            true,
                            ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                        )) as Required<CryptoKeyPair>
                    privPromise = serializeToBase64(privateKey)
                    digestCert = await crypto.subtle
                        .exportKey('spki' as const, publicKey)
                        .then((keydata) =>
                            crypto.subtle
                                .digest(hashAlgorithm, keydata)
                                .then((data) =>
                                    Buffer.from(data).toString('base64')
                                )
                        )
                    clusterResponse = await createCluster({
                        client: itemClient,
                        actions: finishedActions,
                        description,
                        hashAlgorithm,
                        publicKey,
                        privateKey,
                        privateKeyKey: key,
                        public: values.public,
                        featured: values.featured,
                    })
                }
                if (clusterResponse.errors || !clusterResponse.data) {
                    console.error('failed', clusterResponse.errors)
                    setSubmitting(false)
                    return
                }
                // should be solved better
                const newNode =
                    clusterResponse.data.updateOrCreateCluster.cluster
                configUpdate.hosts[url] = {
                    clusters: {
                        [newNode.id as string]: {
                            hashes: {
                                ...hashes,
                            },
                        },
                    },
                    contents: {},
                }
                if (digestCert && privPromise) {
                    ;(
                        configUpdate.hosts as Interfaces.ConfigInterface['hosts']
                    )[url].clusters[newNode.id as string].hashes[digestCert] =
                        []
                    configUpdate.certificates[digestCert] = {
                        data: await privPromise,
                        note: 'initial certificate',
                    }
                }

                const newConfig = await updateConfigRemoteReducer(config, {
                    update: configUpdate,
                    client: baseClient,
                    nullonnoupdate: true,
                })
                const nTokens = newConfig
                    ? extractAuthInfo({
                          config: newConfig,
                          url,
                          clusters: new Set([
                              clusterResponse.data.updateOrCreateCluster.cluster
                                  .id,
                          ]),
                          require: new Set(['update', 'manage']),
                      }).tokens
                    : []
                if (newConfig) {
                    saveConfig(newConfig as Interfaces.ConfigInterface)
                    updateConfig(newConfig, true)
                }
                updateMainCtx({
                    title: name || '',
                    action: 'update',
                    item: clusterResponse.data.updateOrCreateCluster.cluster.id,
                    url,
                    updateId:
                        clusterResponse.data.updateOrCreateCluster.cluster
                            .updateId,
                    tokens: [...mainCtx.tokens, ...nTokens],
                })
                updateSearchCtx({
                    cluster:
                        clusterResponse.data.updateOrCreateCluster.cluster.id,
                })
            }}
        >
            {({ submitForm, isSubmitting, initialValues, dirty }) => {
                const loading = !!(isSubmitting || loadingIntern)
                return (
                    <Form>
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <Field
                                    component={FormikTextField}
                                    name="name"
                                    type="text"
                                    label="Name"
                                    fullWidth
                                    disabled={disabled || loading}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <Field
                                    component={FormikTextField}
                                    name="note"
                                    type="text"
                                    label="Note"
                                    fullWidth
                                    multiline
                                    disabled={disabled || loading}
                                />
                            </Grid>

                            <Grid item xs={6}>
                                <Field
                                    component={FormikCheckboxWithLabel}
                                    name="public"
                                    type="checkbox"
                                    Label={{ label: 'Public' }}
                                    disabled={disabled || loading}
                                />
                            </Grid>

                            <Grid item xs={6}>
                                <Field
                                    component={FormikCheckboxWithLabel}
                                    name="featured"
                                    type="checkbox"
                                    Label={{ label: 'Featured' }}
                                    disabled={disabled || loading}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <List>
                                    <ListSubheader disableSticky>
                                        Tokens
                                    </ListSubheader>
                                    <FieldArray name="actions">
                                        {({
                                            push,
                                            remove,
                                            form,
                                        }: {
                                            form: FormikProps<
                                                typeof initialValues
                                            >
                                        } & ArrayHelpers) => {
                                            const items =
                                                form.values.actions.map(
                                                    (val, index) => {
                                                        return (
                                                            <ActionEntry
                                                                index={index}
                                                                key={`${index}`}
                                                                disabled={
                                                                    disabled ||
                                                                    loading
                                                                }
                                                                action={val}
                                                                tokens={
                                                                    actionTokens
                                                                }
                                                                deleteFn={
                                                                    disabled
                                                                        ? undefined
                                                                        : () =>
                                                                              remove(
                                                                                  index
                                                                              )
                                                                }
                                                                divider
                                                            />
                                                        )
                                                    }
                                                )
                                            if (!disabled) {
                                                items.push(
                                                    <ActionEntry
                                                        key="new"
                                                        disabled={loading}
                                                        tokens={actionTokens}
                                                        addFn={push}
                                                    />
                                                )
                                            }
                                            return items
                                        }}
                                    </FieldArray>
                                </List>
                            </Grid>
                            <Grid item xs={12}>
                                {loading && <LinearProgress />}
                            </Grid>
                            {viewOnly ? null : (
                                <Grid item xs={12}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        disabled={loading || disabled || !dirty}
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

const EditCluster = ({ viewOnly = false }: { viewOnly?: boolean }) => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<
        | (UnpackPromise<ReturnType<typeof extractCombinedInfo>> & {
              key: string
          })
        | null
    >(null)
    const {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(getClusterQuery, {
        pollInterval: 60000,
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'network-only',
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (dataUnfinished) {
            refetch()
        }
    }, [mainCtx.updateId])
    React.useEffect(() => {
        let active = true
        const f = async () => {
            if (!dataUnfinished || !dataUnfinished.secretgraph.node) {
                if (dataUnfinished) {
                    console.debug(dataUnfinished.secretgraph.node)
                    refetch()
                }
                return
            }
            const updateOb = {
                shareUrl: dataUnfinished.secretgraph.node.link,
                deleted: dataUnfinished.secretgraph.node.deleted || null,
                updateId: dataUnfinished.secretgraph.node.updateId,
            }
            if (
                dataUnfinished.secretgraph.node.id == config.configCluster &&
                mainCtx.url == config.baseUrl &&
                !updateOb.deleted
            ) {
                updateOb.deleted = false
            }
            const newData = await extractCombinedInfo({
                config,
                node: dataUnfinished.secretgraph.node,
                url: mainCtx.url as string,
                tokens: mainCtx.tokens,
                hashAlgorithms:
                    dataUnfinished.secretgraph.config.hashAlgorithms,
            })
            if (active) {
                updateMainCtx(updateOb)
                setData({
                    ...newData,
                    key: `edit${new Date().getTime()}`,
                })
            }
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished, config, loading])

    if (!data) {
        return null
    }

    return <ClusterIntern viewOnly={viewOnly} loading={loading} {...data} />
}

const ViewCluster = () => {
    return <EditCluster viewOnly />
}

const AddCluster = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const [data, setData] = React.useState<
        (Omit<ClusterInternProps, 'disabled' | 'url'> & { key: string }) | null
    >(null)

    let { data: dataUnfinished, loading } = useQuery(serverConfigQuery, {
        pollInterval: 60000,
        onError: console.error,
    })
    const { key, keyb64 } = React.useMemo(() => {
        const key = crypto.getRandomValues(new Uint8Array(32))
        const keyb64 = Buffer.from(key).toString('base64')
        return {
            key,
            keyb64,
        }
    }, [])

    React.useEffect(() => {
        let active = true
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            updateMainCtx({
                shareUrl: null,
                deleted: false,
                updateId: null,
            })
            const hashAlgorithm = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )[0]

            const hashKey = await hashObject(key, hashAlgorithm)
            if (active) {
                setData({
                    name: '',
                    note: '',
                    featured: false,
                    public: false,
                    mapper: {
                        [hashKey]: {
                            type: 'action',
                            data: keyb64,
                            note: '',
                            newHash: hashKey,
                            oldHash: null,
                            actions: new Set(['manage']),
                            hasUpdate: true,
                        },
                    },
                    hashAlgorithm,
                    key: `${new Date().getTime()}`,
                })
            }
        }
        f()
        return () => {
            active = false
        }
    }, [activeUrl, dataUnfinished])

    if (!data) {
        return null
    }
    return <ClusterIntern {...data} loading={loading} url={activeUrl} />
}

export default function ClusterComponent() {
    const { mainCtx } = React.useContext(Contexts.Main)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            add={AddCluster}
            view={ViewCluster}
            edit={EditCluster}
        />
    )
}
