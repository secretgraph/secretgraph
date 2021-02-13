import * as React from 'react'
import { Theme } from '@material-ui/core/styles'
import CircularProgress from '@material-ui/core/CircularProgress'
import Typography from '@material-ui/core/Typography'

import Grid from '@material-ui/core/Grid'

import { saveAs } from 'file-saver'
import { useQuery, useApolloClient, ApolloClient } from '@apollo/client'
import {
    Formik,
    FieldProps,
    Form,
    FastField,
    Field,
    FormikValues,
} from 'formik'

import { TextField as FormikTextField } from 'formik-material-ui'

import { ConfigInterface, MainContextInterface } from '../interfaces'
import * as Constants from '../constants'
import { MainContext, InitializedConfigContext } from '../contexts'
import {
    decryptContentId,
    decryptContentObject,
    updateContent,
    createKeys,
    deleteNode,
} from '../utils/operations'
import {
    extractTags,
    extractUnencryptedTags,
    unserializeToCryptoKey,
    serializeToBase64,
} from '../utils/encryption'
import { extractAuthInfo, extractPrivKeys } from '../utils/config'
import { extractPubKeysCluster } from '../utils/graphql'
import DecisionFrame from '../components/DecisionFrame'
import ClusterSelect from '../components/forms/ClusterSelect'

import {
    keysRetrievalQuery,
    findPublicKeyQuery,
    getContentConfigurationQuery,
} from '../queries/content'
import { useStylesAndTheme } from '../theme'
import { newClusterLabel } from '../messages'
import { useAsync } from 'react-async'

async function loadKeys({
    client,
    id,
    config,
    url,
}: {
    client: ApolloClient<any>
    id: string
    config: ConfigInterface
    url: string
}) {
    const { keys: authorization } = extractAuthInfo({
        config,
        url,
    })
    const { data } = await client.query({
        query: keysRetrievalQuery,
        variables: {
            id,
            authorization,
        },
    })
    const requests = []
    const results = {
        hashAlgorithms: data.secretgraph.config.hashAlgorithms,
    } as {
        hashAlgorithms: string[]
        publicKey: {
            tags: { [key: string]: string[] }
            data: ArrayBuffer
            nodeData: any
        }
        privateKey?: {
            tags: { [key: string]: string[] }
            data: ArrayBuffer
            nodeData: any
        }
    }
    requests.push(
        fetch(data.secretgraph.node.link, {
            headers: {
                Authorization: authorization.join(','),
            },
        }).then(async (val) => {
            results['publicKey'] = {
                tags: await extractUnencryptedTags({
                    tags: data.secretgraph.node.tags,
                }),
                data: await val.arrayBuffer(),
                nodeData: data.secretgraph.node,
            }
        })
    )
    if (
        data.secretgraph.node.referencedBy &&
        data.secretgraph.node.referencedBy.edges.length > 0
    ) {
        const nodeData = data.secretgraph.node.referencedBy.edges[0].node
        requests.push(
            decryptContentObject({
                config,
                nodeData,
                blobOrTokens: authorization,
            }).then((val) => {
                if (!val) {
                    return
                }
                results['privateKey'] = {
                    data: val.data,
                    tags: val.tags,
                    nodeData: val.nodeData,
                }
            })
        )
    }
    await Promise.allSettled(requests)
    return results
}

function InnerKeys({
    url,
    disabled,
    hashAlgorithms,
}: {
    url: string
    disabled?: boolean
    hashAlgorithms: string[]
}) {
    const [joinedHashes, setJoinedHashes] = React.useState('loading')
    return (
        <Form>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <Typography variant="h5">Key hashes</Typography>
                    <Typography variant="body2">{joinedHashes}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Field
                        component={ClusterSelect}
                        url={url}
                        name="cluster"
                        disabled={disabled}
                        label="Cluster"
                        firstIfEmpty
                    />
                </Grid>
                <Grid item xs={12}>
                    <Field name="publicKey">
                        {(formikProps: FieldProps<any>) => {
                            return (
                                <FormikTextField
                                    {...formikProps}
                                    fullWidth
                                    label="Public Key"
                                    disabled={disabled}
                                    multiline
                                    variant="outlined"
                                />
                            )
                        }}
                    </Field>
                    <Field
                        component={FormikTextField}
                        name="publicKey"
                        fullWidth
                        label="Public Key"
                        disabled={disabled}
                        multiline
                        variant="outlined"
                    />
                </Grid>
                <Grid item xs={12}>
                    <Field name="privateKey">
                        {(formikProps: FieldProps<any>) => {
                            return (
                                <FormikTextField
                                    {...formikProps}
                                    fullWidth
                                    label="Private Key"
                                    disabled={disabled}
                                    multiline
                                    variant="outlined"
                                />
                            )
                        }}
                    </Field>
                </Grid>
                <Grid item xs={12}>
                    <Field
                        component={FormikTextField}
                        name="password"
                        type="password"
                        fullWidth
                        label="Password"
                        disabled={disabled}
                        variant="outlined"
                    />
                </Grid>
            </Grid>
        </Form>
    )
}

const ViewKeys = () => {
    const { classes, theme } = useStylesAndTheme()
    const client = useApolloClient()
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const { config } = React.useContext(InitializedConfigContext)
    const { data, isLoading } = useAsync({
        promiseFn: loadKeys,
        onReject: console.error,
        onResolve: ({ publicKey, privateKey }) => {
            if (!data) {
                return
            }
            const updateOb: Partial<MainContextInterface> = {
                deleted: publicKey.nodeData.deleted,
            }
            if (publicKey.tags.key_hash && publicKey.tags.key_hash.length > 0) {
                updateOb['title'] = publicKey.tags.key_hash[0]
            }
            updateMainCtx(updateOb)
        },
        suspense: true,
        id: mainCtx.item as string,
        config,
        client,
        url: mainCtx.url as string,
        watch: (mainCtx.url as string) + mainCtx.item + '' + mainCtx.deleted,
    })
    if (!data || isLoading) {
        return null
    }

    return (
        <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
                <Typography variant="h5">Key hashes</Typography>
                <Typography variant="body2">
                    {data.publicKey.tags.key_hash.join(', ')}
                </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
                <Typography variant="h5">Cluster</Typography>
                <Typography variant="body2">
                    {data.publicKey.nodeData.cluster}
                </Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="h5">Public Key</Typography>
                <Typography variant="body2" style={{ whiteSpace: 'pre-line' }}>
                    {`-----BEGIN PUBLIC KEY-----\n${btoa(
                        String.fromCharCode.apply(
                            null,
                            new Uint8Array(data.publicKey.data)
                        )
                    )}\n-----END PUBLIC KEY-----`}
                </Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="h5">Private Key</Typography>
                <Typography variant="body2" style={{ whiteSpace: 'pre-line' }}>
                    {data.privateKey
                        ? `-----BEGIN PRIVATE KEY-----\n${btoa(
                              String.fromCharCode.apply(
                                  null,
                                  new Uint8Array(data.privateKey.data)
                              )
                          )}\n-----END PRIVATE KEY-----`
                        : '-'}
                </Typography>
            </Grid>
        </Grid>
    )
}
const EditKeys = () => {
    const { classes, theme } = useStylesAndTheme()
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const client = useApolloClient()
    const { config } = React.useContext(InitializedConfigContext)
    const { data, isLoading, reload } = useAsync({
        promiseFn: loadKeys,
        suspense: true,
        onReject: console.error,
        id: mainCtx.item as string,
        config,
        client,
        url: mainCtx.url as string,
        watch: (mainCtx.url as string) + mainCtx.item + '' + mainCtx.deleted,
    })
    if (!data || isLoading) {
        return null
    }
    const initialValues = {
        cluster: data.publicKey.nodeData.cluster,
        publicKey: `-----BEGIN PUBLIC KEY-----\n${btoa(
            String.fromCharCode.apply(null, new Uint8Array(data.publicKey.data))
        )}\n-----END PUBLIC KEY-----`,
        privateKey: data.privateKey
            ? `-----BEGIN PRIVATE KEY-----\n${btoa(
                  String.fromCharCode.apply(
                      null,
                      new Uint8Array(data.privateKey.data)
                  )
              )}\n-----END PRIVATE KEY-----`
            : '',
    }

    return (
        <Formik
            initialValues={initialValues}
            validate={(values) => {
                const errors: Partial<
                    { [key in keyof typeof values]: string }
                > = {}
                if (!values.publicKey) {
                    errors['publicKey'] = 'empty'
                }
                return errors
            }}
            onSubmit={async (values, { setSubmitting, setValues }) => {
                const authinfo = extractAuthInfo({
                    config,
                    clusters: new Set([
                        values.cluster,
                        data.publicKey.nodeData.cluster.id,
                    ]),
                    url: mainCtx.url as string,
                    require: new Set(['update', 'delete', 'manage']),
                })

                // steps: sign with all other keys, if private key specified: create cryptotag
                const pubkeysResult = await client.query({
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.keys,
                        id: mainCtx.item,
                    },
                })

                const hashAlgorithm =
                    config.hosts[mainCtx.url as string].hashAlgorithms[0]

                const key = crypto.getRandomValues(new Uint8Array(32))
                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url: mainCtx.url as string,
                    hashAlgorithm,
                })
                const keyParams = {
                    name: 'RSA-OAEP',
                    hash:
                        Constants.mapHashNames[
                            pubkeysResult.data.secretgraph.config
                                .hashAlgorithms[0]
                        ].operationName,
                }
                const pubkeys = []
                for (const { node } of pubkeysResult.data.secretgraph.node
                    .cluster.contents.edges) {
                    if (
                        node.id != mainCtx.item &&
                        node.tags.includes('type=PublicKey')
                    ) {
                        for (const tag of node.tags) {
                            if (tag.startsWith('key_hash=')) {
                                const cert =
                                    config.certificates[tag.match(/=(.*)/)[1]]
                                if (cert) {
                                    pubkeys.push(
                                        await unserializeToCryptoKey(
                                            cert,
                                            keyParams,
                                            'privateKey'
                                        )
                                    )
                                    break
                                }
                            }
                        }
                    }
                }
                let privKey = null
                if (values.privateKey.trim()) {
                    // can fail, is wanted to crash
                    const matchedPrivKey = (values.privateKey.match(
                        /-----BEGIN PRIVATE KEY-----\s*(.+)\s*-----END PRIVATE KEY-----/m
                    ) as string[])[1]
                    privKey = await unserializeToCryptoKey(
                        matchedPrivKey,
                        keyParams,
                        'privateKey'
                    )
                } else if (data.privateKey) {
                    // privateKey is empty
                    await deleteNode({
                        client,
                        id: data.privateKey.nodeData.id,
                        authorization: authinfo.keys,
                    })
                }
                if (
                    values.publicKey.trim() != initialValues.publicKey.trim() ||
                    (values.cluster &&
                        values.cluster != data.publicKey.nodeData.cluster)
                ) {
                    // delete and recreate
                    console.log('Public Key changed, recreate')
                    // can fail, is wanted to crash
                    const matchedPubKey = (values.publicKey.match(
                        /-----BEGIN PUBLIC KEY-----\s*(.+)\s*-----END PUBLIC KEY-----/m
                    ) as string[])[1]
                    const pubKey = await unserializeToCryptoKey(
                        matchedPubKey,
                        keyParams,
                        'publicKey'
                    )
                    await deleteNode({
                        client,
                        id: data.publicKey.nodeData.id,
                        authorization: authinfo.keys,
                    })
                    // recursively deletes private key but it would still be visible, so do it here
                    if (data.privateKey && privKey) {
                        await deleteNode({
                            client,
                            id: data.privateKey.nodeData.id,
                            authorization: authinfo.keys,
                        })
                    }
                    const { data: newData } = await createKeys({
                        client,
                        config,
                        cluster: values.cluster as string,
                        publicKey: pubKey,
                        privateKey: privKey || undefined,
                        privkeys: Object.values(privkeys),
                        pubkeys: Object.values(pubkeys),
                        hashAlgorithm: hashAlgorithm,
                        authorization: authinfo.keys,
                    })
                    updateMainCtx({
                        item: newData.updateOrCreateContent.content.id,
                    })
                } else {
                    await updateContent({
                        id: data.publicKey.nodeData.id,
                        updateId: data.publicKey.nodeData.updateId,
                        client,
                        config,
                        privkeys: await Promise.all(Object.values(privkeys)),
                        pubkeys: Object.values(pubkeys),
                        hashAlgorithm,
                        authorization: authinfo.keys,
                    })
                    if (data.privateKey) {
                        await updateContent({
                            id: data.privateKey.nodeData.id,
                            updateId: data.privateKey.nodeData.updateId,
                            client,
                            config,
                            value: privKey || undefined,
                            privkeys: await Promise.all(
                                Object.values(privkeys)
                            ),
                            pubkeys: Object.values(pubkeys),
                            hashAlgorithm,
                            authorization: authinfo.keys,
                        })
                    }
                    reload()
                }
            }}
        >
            {(formikProps) => {
                return (
                    <InnerKeys
                        hashAlgorithms={data.hashAlgorithms}
                        url={mainCtx.url as string}
                    />
                )
            }}
        </Formik>
    )
}

const AddKeys = () => {
    const { classes, theme } = useStylesAndTheme()

    return <></>
}

async function findOrReturn({
    client,
    config,
    id,
    url,
}: {
    client: ApolloClient<any>
    config: ConfigInterface
    id: string | null
    url: string | null
}) {
    if (!id || !url) {
        return true
    }
    const { keys: authorization } = extractAuthInfo({
        config,
        url,
    })
    const { data } = await client.query({
        query: findPublicKeyQuery,
        variables: {
            authorization,
            id,
        },
    })
    const node = data.secretgraph.node
    if (node.tags.includes('type=PublicKey')) {
        return true
    }
    let d = null
    if (node) {
        d = node.references
    }
    if (d && d.edges.length) {
        return d.edges[0].node.id
    }
    return null
}

export default function KeyComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const { config } = React.useContext(InitializedConfigContext)
    const client = useApolloClient()
    const { data, isLoading } = useAsync({
        promiseFn: findOrReturn,
        onReject: console.error,
        onResolve: (data) => {
            if (data === true) {
            } else if (data) {
                updateMainCtx({ item: data, type: 'PublicKey' })
            } else {
                updateMainCtx({ item: null, type: 'PublicKey', action: 'add' })
            }
        },
        suspense: true,
        client,
        id: mainCtx.action === 'add' ? null : (mainCtx.item as string | null),
        config,
        url: mainCtx.url,
    })
    if (isLoading) {
        return null
    }
    if (data !== true) {
        return null
    }
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            view={ViewKeys}
            edit={EditKeys}
            add={AddKeys}
        />
    )
}
