import {
    ApolloClient,
    FetchResult,
    useApolloClient,
    useQuery,
} from '@apollo/client'
import Button from '@material-ui/core/Button'
import Collapse from '@material-ui/core/Collapse'
import Grid from '@material-ui/core/Grid'
import IconButton from '@material-ui/core/IconButton'
import LinearProgress from '@material-ui/core/LinearProgress'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import Typography from '@material-ui/core/Typography'
import AddIcon from '@material-ui/icons/Add'
import MoreVertIcon from '@material-ui/icons/MoreVert'
import { FastField, Field, FieldArray, Form, Formik, FormikProps } from 'formik'
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

import { ActionEntry, ActionProps } from '../components/ActionsDialog'
import DecisionFrame from '../components/DecisionFrame'
import { CLUSTER, RDF, SECRETGRAPH, XSD, contentStates } from '../constants'
import * as Contexts from '../contexts'
import * as Interfaces from '../interfaces'
import {
    getClusterConfigurationQuery,
    getClusterQuery,
} from '../queries/cluster'
import { useStylesAndTheme } from '../theme'
import { extractPublicInfo as extractPublicInfoShared } from '../utils/cluster'
import { calculateActionMapper, extractAuthInfo } from '../utils/config'
import {
    findWorkingHashAlgorithms,
    hashObject,
    serializeToBase64,
} from '../utils/encryption'
import {
    createCluster,
    updateCluster,
    updateConfigRemoteReducer,
} from '../utils/operations'
import * as SetOps from '../utils/set'
import { RequireAttributes } from '../utils/typing'
import { UnpackPromise, ValueType } from '../utils/typing'

async function extractPublicInfo({
    config,
    node,
    url,
    tokens,
    hashAlgorithm,
}: {
    config: Interfaces.ConfigInterface
    node?: any
    url: string
    tokens: string[]
    hashAlgorithm: string
}) {
    const { name, note, publicTokens } = extractPublicInfoShared(
        node.publicInfo,
        true
    )
    const mapper = await calculateActionMapper({
        nodeData: node,
        config,
        unknownTokens: [...publicTokens, ...tokens],
        knownHashes:
            (node && url && config.hosts[url]?.clusters[node.id]?.hashes) || {},
        hashAlgorithm,
    })
    return {
        publicInfo: node.publicInfo,
        mapper,
        name: name || '',
        note: note || '',
        url,
        hashAlgorithm,
    }
}

interface ClusterInternProps {
    readonly publicInfo?: string
    readonly name: string
    readonly note: string
    url: string
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof calculateActionMapper>>
    hashAlgorithm: string
}

const ClusterIntern = ({ mapper, ...props }: ClusterInternProps) => {
    const client = useApolloClient()
    const { baseClient } = React.useContext(Contexts.Clients)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { updateSearchCtx } = React.useContext(Contexts.Search)
    React.useLayoutEffect(() => {
        updateMainCtx({ title: props.name || '' })
    }, [props.name, props.note])

    const actions: ActionProps[] = []
    Object.values<ValueType<typeof mapper>>(mapper).forEach((params) => {
        const entry = mapper[params.newHash]
        const existingActions = entry.configActions
        for (const actionType of existingActions.size
            ? existingActions
            : ['other']) {
            actions.push({
                token: params.token,
                newHash: params.newHash,
                start: null,
                stop: null,
                note: entry.note || '',
                value: {
                    action: actionType,
                },
                update: SetOps.isNotEq(
                    SetOps.difference(Object.keys(entry.newActions), ['other']),
                    Object.keys(entry.configActions)
                ),
                delete: false,
                readonly: false,
                locked: true,
                clusterAction: true,
            })
        }
    })
    const actionTokens = React.useMemo(
        () => (mapper ? actions.map((val) => val.token) : mainCtx.tokens),
        [actions]
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
            onSubmit={async (values, { setSubmitting, setValues }) => {
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
                const finishedActions: Interfaces.ActionInterface[] = []
                const configUpdate: RequireAttributes<
                    Interfaces.ConfigInputInterface,
                    'hosts' | 'tokens' | 'certificates'
                > = {
                    hosts: {},
                    tokens: {},
                    certificates: {},
                }
                const hashes: { [hash: string]: string[] } = {}
                actions.forEach((val) => {
                    const mapperval =
                        val.newHash && mapper ? mapper[val.newHash] : undefined
                    if (val.readonly) {
                        return
                    }
                    if (val.delete) {
                        if (!val.oldHash) {
                            return
                        }
                        finishedActions.push({
                            idOrHash: val.oldHash,
                            value: 'delete',
                        })
                        return
                    }
                    if (val.newHash) {
                        if (val.update) {
                            if (!mapperval) {
                                throw Error('requires mapper')
                            }
                            hashes[val.newHash] = [
                                ...new Set([
                                    ...Object.keys(mapperval.newActions),
                                ]),
                            ]
                            if (
                                mapperval.oldHash &&
                                val.newHash != mapperval.oldHash
                            ) {
                                configUpdate.tokens[mapperval.oldHash] = null
                            }
                        }
                        if (!mapperval || mapperval?.note != val.note) {
                            configUpdate.tokens[val.newHash] = {
                                ...config.tokens[val.newHash],
                                note: val.note,
                            }
                        }
                    }

                    if (val.locked) {
                        return
                    }
                    finishedActions.push({
                        idOrHash: val.oldHash,
                        start: val.start || undefined,
                        stop: val.stop || undefined,
                        value: JSON.stringify(val.value),
                        key: val.token,
                    })
                })
                if (mainCtx.item && mainCtx.type == 'Cluster') {
                    clusterResponse = await updateCluster({
                        id: mainCtx.item as string,
                        client,
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
                    if (!clusterResponse.errors && clusterResponse.data) {
                        configUpdate['hosts'][props.url as string] = {
                            hashAlgorithms: findWorkingHashAlgorithms(
                                clusterResponse.data.data.secretgraph.config
                                    .hashAlgorithms
                            ),
                        }
                    }
                } else {
                    const key = crypto.getRandomValues(new Uint8Array(32))
                    const {
                        publicKey,
                        privateKey,
                    } = (await crypto.subtle.generateKey(
                        {
                            name: 'RSA-OAEP',
                            //modulusLength: 8192,
                            modulusLength: 2048,
                            publicExponent: new Uint8Array([1, 0, 1]),
                            hash: props.hashAlgorithm,
                        },
                        true,
                        ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                    )) as CryptoKeyPair
                    const digestCertificatePromise = crypto.subtle
                        .exportKey('spki' as const, publicKey)
                        .then((keydata) =>
                            crypto.subtle
                                .digest(props.hashAlgorithm, keydata)
                                .then((data) =>
                                    btoa(
                                        String.fromCharCode(
                                            ...new Uint8Array(data)
                                        )
                                    )
                                )
                        )
                    const digestActionKeyPromise = crypto.subtle
                        .digest(
                            props.hashAlgorithm,
                            crypto.getRandomValues(new Uint8Array(32))
                        )
                        .then((data) =>
                            btoa(String.fromCharCode(...new Uint8Array(data)))
                        )
                    clusterResponse = await createCluster({
                        client,
                        actions: finishedActions,
                        publicInfo: '',
                        hashAlgorithm: props.hashAlgorithm,
                        publicKey,
                        privateKey,
                        privateKeyKey: key,
                    })
                    if (!clusterResponse.errors && clusterResponse.data) {
                        const [
                            digestActionKey,
                            digestCertificate,
                        ] = await Promise.all([
                            digestActionKeyPromise,
                            digestCertificatePromise,
                        ])
                        const newNode = clusterResponse.data.secretgraph.node
                        configUpdate.hosts[props.url as string] = {
                            hashAlgorithms: findWorkingHashAlgorithms(
                                clusterResponse.data.secretgraph.config
                                    .hashAlgorithms
                            ),
                            clusters: {
                                [newNode.id as string]: {
                                    hashes: {
                                        [digestActionKey]: ['manage'],
                                        [digestCertificate]: [],
                                    },
                                },
                            },
                            contents: {},
                        }
                        configUpdate.tokens[digestCertificate] = {
                            token: await serializeToBase64(privateKey),
                            note: '',
                        }
                    }
                }
                if (clusterResponse.errors || !clusterResponse.data) {
                    setSubmitting(false)
                    return
                }
                updateConfig(
                    await updateConfigRemoteReducer(config, {
                        update: configUpdate,
                        client: baseClient,
                    }),
                    true
                )

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
                setSubmitting(false)
            }}
        >
            {({ submitForm, isSubmitting, initialValues }) => (
                <Form>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <FastField
                                component={FormikTextField}
                                name="name"
                                type="text"
                                label="Name"
                                fullWidth
                                disabled={props.disabled || isSubmitting}
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
                                disabled={props.disabled || isSubmitting}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <List style={{ maxHeight: '90vh' }}>
                                <FieldArray name="actions">
                                    {({
                                        form,
                                    }: {
                                        form: FormikProps<typeof initialValues>
                                    }) =>
                                        form.values.actions.map(
                                            (val, index) => {
                                                return (
                                                    <ActionEntry
                                                        index={index}
                                                        disabled={
                                                            props.disabled
                                                        }
                                                        action={val}
                                                        tokens={actionTokens}
                                                    />
                                                )
                                            }
                                        )
                                    }
                                </FieldArray>
                            </List>
                        </Grid>
                        <Grid item xs={12}>
                            {isSubmitting && <LinearProgress />}
                        </Grid>
                        <Grid item xs={12}>
                            {props.disabled ? null : (
                                <Button
                                    variant="contained"
                                    color="primary"
                                    disabled={isSubmitting}
                                    onClick={submitForm}
                                >
                                    Submit
                                </Button>
                            )}
                        </Grid>
                    </Grid>
                </Form>
            )}
        </Formik>
    )
}

const ViewCluster = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] = React.useState<UnpackPromise<
        ReturnType<typeof extractPublicInfo>
    > | null>(null)

    const { loading } = useQuery(getClusterQuery, {
        pollInterval: 60000,
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
        },
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
                    hashAlgorithm: findWorkingHashAlgorithms(
                        data.secretgraph.config.hashAlgorithms
                    )[0],
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
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.Config)
    const [data, setData] = React.useState<ClusterInternProps | null>(null)

    const { loading } = useQuery(getClusterConfigurationQuery, {
        pollInterval: 60000,
        variables: {},
        onCompleted: async (data) => {
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
                        newActions: {
                            manage: new Set([null]),
                        },
                    },
                },
                hashAlgorithm: hashAlgorithms[0],
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
    const [data, setData] = React.useState<UnpackPromise<
        ReturnType<typeof extractPublicInfo>
    > | null>(null)
    const { loading } = useQuery(getClusterQuery, {
        pollInterval: 60000,
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
        },
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
                    hashAlgorithm: findWorkingHashAlgorithms(
                        data.secretgraph.config.hashAlgorithms
                    )[0],
                })
            )
        },
    })

    if (!data) {
        return null
    }

    return <ClusterIntern key="enabled" {...data} />
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
