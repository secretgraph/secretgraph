import {} from '../utils/typing'

import {
    ApolloClient,
    FetchResult,
    useLazyQuery,
    useQuery,
} from '@apollo/client'
import { ListSubheader } from '@material-ui/core'
import Button from '@material-ui/core/Button'
import Collapse from '@material-ui/core/Collapse'
import Grid from '@material-ui/core/Grid'
import IconButton from '@material-ui/core/IconButton'
import LinearProgress from '@material-ui/core/LinearProgress'
import List from '@material-ui/core/List'
import {
    ArrayHelpers,
    FastField,
    Field,
    FieldArray,
    Form,
    Formik,
    FormikProps,
} from 'formik'
import { TextField as FormikTextField } from 'formik-material-ui'
import {
    BlankNode,
    Literal,
    NamedNode,
    SPARQLToQuery,
    graph,
    parse,
    serialize,
} from 'rdflib'
import * as React from 'react'
import { useAsync } from 'react-async'

import { ActionEntry } from '../components/ActionsDialog'
import DecisionFrame from '../components/DecisionFrame'
import { CLUSTER, RDF, SECRETGRAPH, XSD, protectedActions } from '../constants'
import * as Contexts from '../contexts'
import * as Interfaces from '../interfaces'
import {
    getClusterConfigurationQuery,
    getClusterQuery,
} from '../queries/cluster'
import { serverConfigQuery } from '../queries/server'
import { useStylesAndTheme } from '../theme'
import {
    ActionInputEntry,
    generateActionMapper,
    transformActions,
} from '../utils/action'
import { extractPublicInfo as extractPublicInfoShared } from '../utils/cluster'
import { extractAuthInfo, saveConfig } from '../utils/config'
import {
    findWorkingHashAlgorithms,
    hashObject,
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../utils/encryption'
import { useFixedQuery } from '../utils/hooks'
import {
    createCluster,
    updateCluster,
    updateConfigRemoteReducer,
} from '../utils/operations'
import * as SetOps from '../utils/set'
import { RequireAttributes, UnpackPromise, ValueType } from '../utils/typing'

async function extractPublicInfo({
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
    const { name, note } = extractPublicInfoShared(node.publicInfo, true)
    const mapper = await generateActionMapper({
        nodeData: node,
        config,
        unknownTokens: tokens,
        knownHashes:
            (node && url && config.hosts[url]?.clusters[node.id]?.hashes) || {},
        hashAlgorithm: hashAlgorithms[0],
    })
    return {
        key: node.updateId,
        publicInfo: node.publicInfo,
        mapper,
        name: name || '',
        note: note || '',
        url,
        hashAlgorithms,
    }
}

interface ClusterInternProps {
    readonly publicInfo?: string
    readonly name: string
    readonly note: string
    url: string
    loading?: boolean
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithms: string[]
}

const ClusterIntern = ({
    mapper,
    disabled,
    hashAlgorithms,
    loading: loadingIntern,
    ...props
}: ClusterInternProps) => {
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
        const actions: ActionInputEntry[] = []
        Object.values<ValueType<typeof mapper>>(mapper).forEach((params) => {
            const entry = mapper[params.newHash]
            const existingActions = entry.configActions
            for (const actionType of existingActions.size
                ? existingActions
                : ['other']) {
                const diffactions = SetOps.difference(entry.foundActions, [
                    'other',
                ])
                actions.push({
                    token: params.token,
                    newHash: params.newHash,
                    oldHash: params.oldHash || undefined,
                    start: '',
                    stop: '',
                    note: entry.note || '',
                    value: {
                        action: actionType,
                    },
                    update:
                        diffactions.size &&
                        SetOps.isNotEq(diffactions, entry.configActions)
                            ? false
                            : undefined,
                    delete: false,
                    readonly: false,
                    locked: true,
                })
            }
        })
        return actions
    }, [mapper])
    const actionTokens = React.useMemo(
        () => (mapper ? actions.map((val) => val.token) : mainCtx.tokens),
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
            }}
            onSubmit={async (
                { actions: actionsNew, ...values },
                { setSubmitting, resetForm }
            ) => {
                let root: BlankNode | undefined = undefined
                const store = graph()
                if (props.publicInfo) {
                    parse(props.publicInfo as string, store, '_:')
                    const results = store.querySync(
                        SPARQLToQuery(
                            `SELECT ?root WHERE {?root a ${CLUSTER(
                                'Cluster'
                            )}. }`,
                            true,
                            store
                        )
                    )
                    if (results[0] && results[0]['?root']) {
                        root = results[0]['?root']
                    }
                }
                if (!root) {
                    root = new BlankNode()
                    store.add(root, RDF('type'), CLUSTER('Cluster'))
                }
                store.removeMany(root, SECRETGRAPH('name'))
                store.removeMany(root, SECRETGRAPH('note'))
                store.add(
                    root,
                    SECRETGRAPH('name'),
                    new Literal(values.name || '', null, XSD('string'))
                )
                store.add(
                    root,
                    SECRETGRAPH('note'),
                    new Literal(values.note || '', null, XSD('string'))
                )
                let clusterResponse: FetchResult<any>
                const {
                    hashes,
                    actions: finishedActions,
                    configUpdate,
                } = await transformActions({
                    actions: actionsNew,
                    mapper,
                    hashAlgorithm: hashAlgorithms[0],
                })
                let digestCert = undefined,
                    privPromise = undefined
                if (mainCtx.item) {
                    clusterResponse = await updateCluster({
                        id: mainCtx.item as string,
                        client: itemClient,
                        updateId: mainCtx.updateId as string,
                        actions: finishedActions,
                        publicInfo: serialize(
                            null as any,
                            store,
                            '_:',
                            'text/turtle'
                        ),
                        authorization: mainCtx.tokens,
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
                                hash: hashAlgorithms[0],
                            },
                            true,
                            ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                        )) as CryptoKeyPair
                    privPromise = serializeToBase64(privateKey)
                    digestCert = await crypto.subtle
                        .exportKey('spki' as const, publicKey)
                        .then((keydata) =>
                            crypto.subtle
                                .digest(hashAlgorithms[0], keydata)
                                .then((data) =>
                                    btoa(
                                        String.fromCharCode(
                                            ...new Uint8Array(data)
                                        )
                                    )
                                )
                        )
                    clusterResponse = await createCluster({
                        client: itemClient,
                        actions: finishedActions,
                        publicInfo:
                            serialize(
                                null as any,
                                store,
                                '_:',
                                'text/turtle'
                            ) || '',
                        hashAlgorithm: hashAlgorithms[0],
                        publicKey,
                        privateKey,
                        privateKeyKey: key,
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
                configUpdate.hosts[props.url as string] = {
                    hashAlgorithms,
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
                    )[props.url as string].clusters[
                        newNode.id as string
                    ].hashes[digestCert] = []
                    configUpdate.tokens[digestCert] = {
                        data: await privPromise,
                        note: 'initial certificate',
                    }
                }

                const newConfig = await updateConfigRemoteReducer(config, {
                    update: configUpdate,
                    client: baseClient,
                })
                saveConfig(newConfig as Interfaces.ConfigInterface)
                updateConfig(newConfig, true)
                console.log(newConfig)
                updateMainCtx({
                    title: values.name || '',
                    action: 'update',
                    item: clusterResponse.data.updateOrCreateCluster.cluster.id,
                    updateId:
                        clusterResponse.data.updateOrCreateCluster.cluster
                            .updateId,
                })
                updateSearchCtx({
                    cluster:
                        clusterResponse.data.updateOrCreateCluster.cluster.id,
                })
            }}
        >
            {({ submitForm, isSubmitting, initialValues, dirty }) => {
                const loading = !!(isSubmitting || loadingIntern)
                //console.log(isSubmitting, loadingIntern, disabled)
                return (
                    <Form>
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <FastField
                                    component={FormikTextField}
                                    name="name"
                                    type="text"
                                    label="Name"
                                    fullWidth
                                    disabled={disabled || loading}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <FastField
                                    component={FormikTextField}
                                    name="note"
                                    type="text"
                                    label="Note"
                                    fullWidth
                                    multiline
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
                            <Grid item xs={12}>
                                {disabled ? null : (
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        disabled={loading || disabled || !dirty}
                                        onClick={submitForm}
                                    >
                                        Submit
                                    </Button>
                                )}
                            </Grid>
                        </Grid>
                    </Form>
                )
            }}
        </Formik>
    )
}

const ViewCluster = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] =
        React.useState<UnpackPromise<
            ReturnType<typeof extractPublicInfo>
        > | null>(null)

    useFixedQuery(getClusterQuery, {
        pollInterval: 60000,
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
        },
        fetchPolicy: 'cache-and-network',
        onError: console.error,
        onCompleted: async (data) => {
            const updateOb = {
                shareUrl: data.secretgraph.node.link,
                deleted: data.secretgraph.node.deleted || null,
                updateId: data.secretgraph.node.updateId,
            }
            if (
                data.secretgraph.node.id == config.configCluster &&
                mainCtx.url == config.baseUrl &&
                !updateOb.deleted
            ) {
                updateOb.deleted = false
            }
            updateMainCtx(updateOb)
            setData(
                await extractPublicInfo({
                    config,
                    node: data.secretgraph.node,
                    url: mainCtx.url as string,
                    tokens: mainCtx.tokens,
                    hashAlgorithms: findWorkingHashAlgorithms(
                        data.secretgraph.config.hashAlgorithms
                    ),
                })
            )
        },
    })
    if (!data) {
        return null
    }

    return <ClusterIntern {...data} disabled />
}

const AddCluster = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<ClusterInternProps | null>(null)

    useFixedQuery(getClusterConfigurationQuery, {
        pollInterval: 60000,
        variables: {},
        onError: console.error,
        onCompleted: async (data) => {
            if (!data) {
                return
            }
            updateMainCtx({
                shareUrl: null,
                deleted: false,
                updateId: null,
            })

            const key = crypto.getRandomValues(new Uint8Array(32))
            const keyb64 = btoa(String.fromCharCode(...key))
            const { data: hashKey, hashAlgorithms } = await hashObject(
                key,
                data.config.hashAlgorithms
            )
            setData({
                name: '',
                note: '',
                url: mainCtx.url as string,
                mapper: {
                    [hashKey]: {
                        token: keyb64,
                        note: '',
                        newHash: hashKey,
                        oldHash: null,
                        configActions: new Set(['manage']),
                        foundActions: new Set(['manage']),
                    },
                },
                hashAlgorithms,
            })
        },
    })
    if (!data) {
        return null
    }

    return <ClusterIntern {...data} />
}

const EditCluster = () => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] =
        React.useState<UnpackPromise<
            ReturnType<typeof extractPublicInfo>
        > | null>(null)
    const { refetch, loading } = useFixedQuery(getClusterQuery, {
        pollInterval: 60000,
        fetchPolicy: 'cache-and-network',
        nextFetchPolicy: 'network-only',
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
        },
        onError: console.error,
        onCompleted: async (data) => {
            console.log(config)
            if (!data) {
                return
            }
            const updateOb = {
                shareUrl: data.secretgraph.node.link,
                deleted: data.secretgraph.node.deleted || null,
                updateId: data.secretgraph.node.updateId,
            }
            if (
                data.secretgraph.node.id == config.configCluster &&
                mainCtx.url == config.baseUrl &&
                !updateOb.deleted
            ) {
                updateOb.deleted = false
            }
            updateMainCtx(updateOb)
            setData(
                await extractPublicInfo({
                    config,
                    node: data.secretgraph.node,
                    url: mainCtx.url as string,
                    tokens: mainCtx.tokens,
                    hashAlgorithms: findWorkingHashAlgorithms(
                        data.secretgraph.config.hashAlgorithms
                    ),
                })
            )
        },
    })
    React.useEffect(() => {
        if (data) {
            refetch()
        }
    }, [mainCtx.updateId, config])

    if (!data) {
        return null
    }

    return <ClusterIntern loading={loading} {...data} />
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
