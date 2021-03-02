import { ApolloClient, FetchResult, useApolloClient } from '@apollo/client'
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
import { FastField, Field, Form, Formik } from 'formik'
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

import DecisionFrame from '../components/DecisionFrame'
import { CLUSTER, RDF, SECRETGRAPH, XSD, contentStates } from '../constants'
import * as Contexts from '../contexts'
import * as Interfaces from '../interfaces'
import { getClusterQuery } from '../queries/cluster'
import { useStylesAndTheme } from '../theme'
import { extractPublicInfo as extractPublicInfoShared } from '../utils/cluster'
import { extractAuthInfo } from '../utils/config'
import { serializeToBase64 } from '../utils/encryption'
import { createCluster, updateCluster } from '../utils/operations'

function item_retrieval_helper({
    client,
    keys,
    item,
}: {
    client: ApolloClient<any>
    keys: string[]
    item: string
}) {
    return client.query({
        query: getClusterQuery,
        variables: {
            id: item,
            authorization: keys,
        },
    })
}

function extractPublicInfo(
    config: Interfaces.ConfigInterface,
    node: any,
    url?: string | null | undefined,
    id?: string | null | undefined
) {
    const privateTokens: [string, string[]][] = []

    const { name, note, publicTokens } = extractPublicInfoShared(
        node.publicInfo,
        true
    )
    if (url && id && config.hosts[url] && config.hosts[url].clusters[id]) {
        for (const hash in config.hosts[url].clusters[id].hashes) {
            const token = config.tokens[hash]
            if (!token) continue
            if (publicTokens.includes(token)) continue
            const actions = config.hosts[url].clusters[id].hashes[hash]
            privateTokens.push([token, actions])
        }
    }
    return {
        publicInfo: node.publicInfo,
        publicTokens,
        privateTokens,
        name,
        note,
        url,
        id,
    }
}

interface TokenListProps {
    initialOpen: boolean
    disabled?: boolean
    privateTokens: [token: string, actions: string[]][]
    publicTokens: string[]
}

const TokenList = ({
    disabled,
    initialOpen,
    privateTokens,
    publicTokens,
}: TokenListProps) => {
    const [openTokens, setOpenTokens] = React.useState(initialOpen)
    return (
        <div>
            <div>
                {!disabled ? (
                    <IconButton
                        aria-label="add"
                        onClick={() => console.log('implement')}
                    >
                        <AddIcon />
                    </IconButton>
                ) : null}
                <Typography variant="h4" component="span">
                    Tokens
                </Typography>
                {
                    <IconButton
                        aria-label="tokens"
                        onClick={() => setOpenTokens(!openTokens)}
                    >
                        <MoreVertIcon />
                    </IconButton>
                }
            </div>
            <Collapse in={openTokens} timeout="auto">
                <List>
                    {publicTokens.map((token: string, index: number) => (
                        <ListItem key={`public:${index}:wrapper`}>
                            <ListItemText primary={`Public Token: ${token}`} />
                        </ListItem>
                    ))}
                    {privateTokens.map(
                        (
                            [token, actions]: [
                                token: string,
                                actions: string[]
                            ],
                            index: number
                        ) => (
                            <ListItem key={`private:${index}:wrapper`}>
                                <ListItemText
                                    primary={`Private Token: ${token}`}
                                    secondary={
                                        'allows actions: ' + actions.join(', ')
                                    }
                                />
                            </ListItem>
                        )
                    )}
                </List>
            </Collapse>
        </div>
    )
}

interface ClusterInternProps {
    readonly publicInfo?: string
    readonly name: string | null
    readonly note: string | null
    id?: string | null
    url?: string | null | undefined
    disabled?: boolean | undefined
    publicTokens: string[]
    privateTokens: [token: string, actions: string[]][]
    keys: string[]
}

const ClusterIntern = (props: ClusterInternProps) => {
    const client = useApolloClient()
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { updateSearchCtx } = React.useContext(Contexts.Search)
    React.useLayoutEffect(() => {
        updateMainCtx({ title: props.name || '' })
    }, [props.name, props.note])
    return (
        <Formik
            initialValues={{
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
                if (props.id) {
                    clusterResponse = await updateCluster({
                        id: props.id as string,
                        client,
                        updateId: mainCtx.updateId as string,
                        publicInfo: serialize(
                            null as any,
                            store,
                            '_:',
                            'text/turtle'
                        ),
                        authorization: props.keys,
                    })
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
                            hash:
                                config.hosts[config.baseUrl].hashAlgorithms[0],
                        },
                        true,
                        ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                    )) as CryptoKeyPair
                    const digestCertificatePromise = crypto.subtle
                        .exportKey('spki' as const, publicKey)
                        .then((keydata) =>
                            crypto.subtle
                                .digest(
                                    config.hosts[config.baseUrl]
                                        .hashAlgorithms[0],
                                    keydata
                                )
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
                            config.hosts[config.baseUrl].hashAlgorithms[0],
                            crypto.getRandomValues(new Uint8Array(32))
                        )
                        .then((data) =>
                            btoa(String.fromCharCode(...new Uint8Array(data)))
                        )
                    const keyb64 = btoa(String.fromCharCode(...key))
                    clusterResponse = await createCluster({
                        client,
                        actions: [
                            { value: '{"action": "manage"}', key: keyb64 },
                        ],
                        publicInfo: '',
                        hashAlgorithm:
                            config.hosts[config.baseUrl].hashAlgorithms[0],
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
                        const newNode =
                            clusterResponse.data.data.secretgraph.node
                        const configUpdate = {
                            hosts: {
                                [props.url as string]: {
                                    hashAlgorithms:
                                        clusterResponse.data.data.secretgraph
                                            .config.hashAlgorithms,
                                    clusters: {
                                        [newNode.id as string]: {
                                            hashes: {
                                                [digestActionKey]: [
                                                    'manage',
                                                    'create',
                                                    'update',
                                                ],
                                                [digestCertificate]: [],
                                            },
                                        },
                                    },
                                },
                            },
                            tokens: {
                                [digestActionKey]: keyb64,
                                [digestCertificate]: await serializeToBase64(
                                    privateKey
                                ),
                            },
                        }
                        // TODO: merge and refetch config
                        updateConfig(configUpdate)
                    }
                }
                if (clusterResponse.errors || !clusterResponse.data) {
                    setSubmitting(false)
                    return
                }
                updateMainCtx({
                    title: values.name || '',
                    action: 'edit',
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
            {({ submitForm, isSubmitting }) => (
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
                        <Grid item xs={12}>
                            <TokenList
                                publicTokens={props.publicTokens}
                                privateTokens={props.privateTokens}
                                initialOpen
                                disabled={props.disabled || isSubmitting}
                            />
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
    const client = useApolloClient()
    const authinfo = extractAuthInfo({
        config,
        url: mainCtx.url as string,
        require: new Set(['view', 'manage']),
    })
    const { data, isLoading } = useAsync({
        promiseFn: item_retrieval_helper,
        onReject: console.error,
        onResolve: (data) => {
            const updateOb = {
                shareUrl: data.data.secretgraph.node.link,
                deleted: data.data.secretgraph.node.deleted || null,
                updateId: data.data.secretgraph.node.updateId,
            }
            if (
                data.data.secretgraph.node.id == config.configCluster &&
                mainCtx.url == config.baseUrl &&
                !updateOb.deleted
            ) {
                updateOb.deleted = false
            }
            updateMainCtx(updateOb)
        },
        suspense: true,
        client: client,
        keys: authinfo.keys,
        item: mainCtx.item,
        watch: mainCtx.item + '' + mainCtx.url + '' + mainCtx.deleted,
    })
    if (isLoading) {
        return null
    }
    if (!(data as any).data.secretgraph.node) {
        console.error('Node empty', data, authinfo)
        return null
    }

    return (
        <ClusterIntern
            {...extractPublicInfo(
                config,
                data?.data?.secretgraph?.node,
                mainCtx.url,
                mainCtx.item
            )}
            disabled
            keys={authinfo.keys}
        />
    )
}

const AddCluster = () => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const authinfo = extractAuthInfo({
        config,
        url: activeUrl,
        require: new Set(['manage']),
    })

    return (
        <ClusterIntern
            name=""
            note=""
            publicTokens={[]}
            privateTokens={[]}
            id={null}
            keys={authinfo.keys}
        />
    )
}

const EditCluster = () => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const client = useApolloClient()
    const authinfo = extractAuthInfo({
        config,
        clusters: new Set([mainCtx.item as string]),
        url: mainCtx.url as string,
        require: new Set(['manage']),
    })
    const { data, isLoading, promise } = useAsync({
        promiseFn: item_retrieval_helper,
        onReject: console.error,
        onResolve: (data) => {
            if (!data) {
                return
            }
            const updateOb = {
                shareUrl: data.data.secretgraph.node.link,
                deleted: data.data.secretgraph.node.deleted || null,
                updateId: data.data.secretgraph.node.updateId,
            }
            if (
                data?.data.secretgraph.node.id == config.configCluster &&
                mainCtx.url == config.baseUrl &&
                !updateOb.deleted
            ) {
                updateOb.deleted = false
            }
            updateMainCtx(updateOb)
        },
        client: client,
        keys: authinfo.keys,
        item: mainCtx.item,
        watch: mainCtx.item + '' + mainCtx.url + '' + mainCtx.deleted,
        suspense: true,
    })

    if (isLoading) {
        return null
    }
    if (!data) {
        return (
            <ClusterIntern
                name=""
                note=""
                publicTokens={[]}
                privateTokens={[]}
                id={mainCtx.item}
                keys={authinfo.keys}
            />
        )
    }
    if (!data?.data?.secretgraph?.node) {
        return (
            <ClusterIntern
                name=""
                note=""
                publicTokens={[]}
                privateTokens={[]}
                id={mainCtx.item}
                keys={authinfo.keys}
            />
        )
    }

    return (
        <ClusterIntern
            {...extractPublicInfo(
                config,
                data.data?.secretgraph?.node,
                mainCtx.url,
                mainCtx.item
            )}
            keys={authinfo.keys}
        />
    )
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
