import {
    ApolloClient,
    ApolloError,
    ApolloQueryResult,
    useApolloClient,
    useQuery,
} from '@apollo/client'
import Button from '@material-ui/core/Button'
import Grid from '@material-ui/core/Grid'
import LinearProgress from '@material-ui/core/LinearProgress'
import { Theme } from '@material-ui/core/styles'
import Typography from '@material-ui/core/Typography'
import { saveAs } from 'file-saver'
import {
    FastField,
    Field,
    FieldProps,
    Form,
    Formik,
    FormikValues,
    useFormikContext,
} from 'formik'
import { TextField as FormikTextField } from 'formik-material-ui'
import * as React from 'react'
import { useAsync } from 'react-async'

import DecisionFrame from '../components/DecisionFrame'
import ClusterSelect from '../components/forms/ClusterSelect'
import * as Constants from '../constants'
import * as Contexts from '../contexts'
import * as Interfaces from '../interfaces'
import { newClusterLabel } from '../messages'
import {
    findPublicKeyQuery,
    getContentConfigurationQuery,
    keysRetrievalQuery,
} from '../queries/content'
import { serverConfigQuery } from '../queries/server'
import { useStylesAndTheme } from '../theme'
import { extractAuthInfo, extractPrivKeys } from '../utils/config'
import {
    extractTags,
    extractUnencryptedTags,
    serializeToBase64,
    unserializeToArrayBuffer,
    unserializeToCryptoKey,
} from '../utils/encryption'
import {
    extractPubKeysCluster,
    extractPubKeysReferences,
} from '../utils/graphql'
import {
    createKeys,
    decryptContentObject,
    deleteNodes,
    updateConfigRemoteReducer,
    updateKey,
} from '../utils/operations'

async function loadKeys({
    client,
    id,
    config,
    url,
}: {
    client: ApolloClient<any>
    id: string
    config: Interfaces.ConfigInterface
    url: string
}) {
    const { tokens: authorization } = extractAuthInfo({
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

    const keyParams = {
        name: 'RSA-OAEP',
        hash:
            Constants.mapHashNames[results['hashAlgorithms'][0]].operationName,
    }
    requests.push(
        fetch(data.secretgraph.node.link, {
            headers: {
                Authorization: authorization.join(','),
            },
        })
            .then(async (val) => {
                results['publicKey'] = {
                    tags: await extractUnencryptedTags({
                        tags: data.secretgraph.node.tags,
                    }),
                    data: await val.arrayBuffer(),
                    nodeData: data.secretgraph.node,
                }
            })
            .catch((reason) => {
                console.error(reason)
                throw reason
            })
    )
    if (
        data.secretgraph.node.referencedBy &&
        data.secretgraph.node.referencedBy.edges.length > 0
    ) {
        const nodeData = data.secretgraph.node.referencedBy.edges[0].node.source
        requests.push(
            decryptContentObject({
                config,
                nodeData,
                blobOrTokens: authorization,
            }).then(
                async (val) => {
                    //console.log(val, config, nodeData, authorization)
                    if (!val) {
                        return
                    }
                    await unserializeToCryptoKey(
                        val.data,
                        keyParams,
                        'privateKey'
                    )
                    results['privateKey'] = {
                        data: val.data,
                        tags: val.tags,
                        nodeData: val.nodeData,
                    }
                },
                (reason) => {
                    console.error(reason)
                    throw reason
                }
            )
        )
    }
    await Promise.allSettled(requests)
    return results
}

async function calcPublicKey(key: string, hashAlgorithms: string[]) {
    const keyParams = {
        name: 'RSA-OAEP',
        hash: Constants.mapHashNames[hashAlgorithms[0]].operationName,
    }
    // can fail, fail wanted
    const matchedPrivKey = (key.match(
        /-----BEGIN PRIVATE KEY-----\s*(.+)\s*-----END PRIVATE KEY-----/m
    ) as string[])[1]
    const publicKey = await unserializeToArrayBuffer(
        unserializeToCryptoKey(matchedPrivKey, keyParams, 'publicKey')
    )

    return `-----BEGIN PUBLIC KEY-----\n${btoa(
        String.fromCharCode.apply(null, new Uint8Array(publicKey))
    )}\n-----END PUBLIC KEY-----`
}

async function calcHashes(key: string, hashAlgorithms: string[]) {
    if (hashAlgorithms.length == 0) {
        return []
    }
    const keyParams = {
        name: 'RSA-OAEP',
        hash: Constants.mapHashNames['' + hashAlgorithms[0]].operationName,
    }
    // can fail, fail wanted
    const matchedPubKey = (key.match(
        /-----BEGIN PUBLIC KEY-----\s*(.+)\s*-----END PUBLIC KEY-----/m
    ) as string[])[1]
    const rawKey = await unserializeToArrayBuffer(
        unserializeToCryptoKey(matchedPubKey, keyParams, 'publicKey', true)
    )
    return await Promise.all(
        hashAlgorithms.map(async (algo) => {
            const operationName =
                Constants.mapHashNames['' + algo].operationName
            return await serializeToBase64(
                crypto.subtle.digest(operationName, rawKey)
            )
        })
    )
}

function InnerKeys({
    url,
    disabled,
    hashAlgorithms,
    generateButton,
}: {
    url: string
    disabled?: boolean
    hashAlgorithms: string[]
    generateButton?: boolean
}) {
    const {
        submitForm,
        isSubmitting,
        setValues,
        setFieldValue,
        errors,
        setErrors,
        values,
        dirty,
    } = useFormikContext<any>()
    const [joinedHashes, setJoinedHashes] = React.useState('loading')
    React.useEffect(() => {
        calcHashes(values.publicKey, hashAlgorithms).then(
            (data) => {
                setJoinedHashes(data.join(', '))
            },
            (reason) => {}
        )
    }, [])
    return (
        <Form>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <Typography variant="h5">Key hashes</Typography>
                    <Typography
                        variant="body2"
                        style={{ wordBreak: 'break-all' }}
                    >
                        {joinedHashes}
                    </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Field
                        component={ClusterSelect}
                        url={url}
                        name="cluster"
                        disabled={isSubmitting || disabled}
                        label="Cluster"
                        firstIfEmpty
                    />
                </Grid>
                <Grid item xs={12}>
                    <Field
                        name="publicKey"
                        component={FormikTextField}
                        validate={async (val: string) => {
                            // validate has side effects
                            if (!val) {
                                setJoinedHashes('')
                                return 'empty'
                            }
                            return await calcHashes(val, hashAlgorithms).then(
                                (data) => {
                                    setJoinedHashes(data.join(', '))
                                    return null
                                },
                                (reason) => {
                                    console.debug(reason)
                                    return 'Invalid Key'
                                }
                            )
                        }}
                        fullWidth
                        label="Public Key"
                        disabled={isSubmitting || disabled}
                        multiline
                        variant="outlined"
                        required
                    />
                </Grid>
                <Grid item xs={12}>
                    <Field
                        name="privateKey"
                        validate={(val: string) => {
                            if (val) {
                                calcPublicKey(val, hashAlgorithms).then(
                                    async (data) => {
                                        setFieldValue('publicKey', data, true)
                                        await calcHashes(
                                            data,
                                            hashAlgorithms
                                        ).then((data) => {
                                            setJoinedHashes(data.join(', '))
                                        })
                                        return null
                                    },
                                    (reason) => {
                                        console.debug(reason)
                                        return 'Invalid Key'
                                    }
                                )
                            }
                        }}
                    >
                        {(formikProps: FieldProps<any>) => {
                            return (
                                <FormikTextField
                                    {...formikProps}
                                    fullWidth
                                    label="Private Key"
                                    disabled={isSubmitting || disabled}
                                    multiline
                                    variant="outlined"
                                />
                            )
                        }}
                    </Field>
                </Grid>
                {/*<Grid item xs={12}>
                    <Field
                        component={FormikTextField}
                        name="password"
                        type="password"
                        fullWidth
                        label="Password"
                        disabled={disabled}
                        variant="outlined"
                    />
                    </Grid>*/}
                <Grid item xs={12}>
                    {isSubmitting && <LinearProgress />}
                </Grid>
                <Grid item xs={12}>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={isSubmitting || !dirty}
                        onClick={submitForm}
                    >
                        Submit
                    </Button>
                    {generateButton && (
                        <Button
                            variant="contained"
                            color="primary"
                            disabled={isSubmitting}
                            onClick={async () => {
                                const operationName =
                                    Constants.mapHashNames[hashAlgorithms[0]]
                                        .operationName
                                const {
                                    publicKey,
                                    privateKey,
                                } = (await crypto.subtle.generateKey(
                                    {
                                        name: 'RSA-OAEP',
                                        modulusLength: 4096,
                                        publicExponent: new Uint8Array([
                                            1,
                                            0,
                                            1,
                                        ]),
                                        hash: operationName,
                                    },
                                    true,
                                    [
                                        'wrapKey',
                                        'unwrapKey',
                                        'encrypt',
                                        'decrypt',
                                    ]
                                )) as CryptoKeyPair
                                setValues(
                                    {
                                        ...values,
                                        publicKey: `-----BEGIN PUBLIC KEY-----\n${await serializeToBase64(
                                            publicKey
                                        )}\n-----END PUBLIC KEY-----`,
                                        privateKey: `-----BEGIN PRIVATE KEY-----\n${await serializeToBase64(
                                            privateKey
                                        )}\n-----END PRIVATE KEY-----`,
                                    },
                                    false
                                )
                                setErrors({
                                    ...errors,
                                    publicKey: undefined,
                                    privateKey: undefined,
                                })
                            }}
                        >
                            Generate
                        </Button>
                    )}
                </Grid>
            </Grid>
        </Form>
    )
}

const ViewKeys = () => {
    const { classes, theme } = useStylesAndTheme()
    const client = useApolloClient()
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { data, isLoading } = useAsync({
        promiseFn: loadKeys,
        onReject: console.error,
        onResolve: ({ publicKey }) => {
            if (!data) {
                return
            }
            const updateOb: Partial<Interfaces.MainContextInterface> = {
                deleted: publicKey.nodeData.deleted,
                updateId: publicKey.nodeData.updateId,
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
                <Typography variant="body2" style={{ wordBreak: 'break-all' }}>
                    {data.publicKey.tags.key_hash.join(', ')}
                </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
                <Typography variant="h5">Cluster</Typography>
                <Typography variant="body2" style={{ wordBreak: 'break-all' }}>
                    {data.publicKey.nodeData.cluster.id}
                </Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="h5">Public Key</Typography>
                <Typography
                    variant="body2"
                    style={{ whiteSpace: 'pre-line', wordBreak: 'break-all' }}
                >
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
                <Typography
                    variant="body2"
                    style={{ whiteSpace: 'pre-line', wordBreak: 'break-all' }}
                >
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
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const client = useApolloClient()
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const { baseClient } = React.useContext(Contexts.Clients)
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
        cluster: data.publicKey.nodeData.cluster.id as string,
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
                    require: new Set(['update', 'create', 'delete', 'manage']),
                })

                // steps: sign with all other keys, if private key specified: create cryptotag
                const pubkeysResult = await client.query({
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.tokens,
                        id: mainCtx.item,
                    },
                })

                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url: mainCtx.url as string,
                    hashAlgorithm:
                        config.hosts[mainCtx.url as string].hashAlgorithms[0],
                })
                const keyParams = {
                    name: 'RSA-OAEP',
                    hash:
                        Constants.mapHashNames[data.hashAlgorithms[0]]
                            .operationName,
                }
                const pubkeys = extractPubKeysCluster({
                    node: pubkeysResult.data.secretgraph.node,
                    authorization: authinfo.tokens,
                    params: keyParams,
                })
                let privKey = null
                if (values.privateKey.trim()) {
                    // can fail, is wanted to crash
                    const matchedPrivKey = (values.privateKey.match(
                        /-----BEGIN PRIVATE KEY-----\s*(.+)\s*-----END PRIVATE KEY-----/m
                    ) as string[])[1]
                    privKey = await unserializeToCryptoKey(
                        matchedPrivKey,
                        keyParams,
                        'privateKey',
                        true
                    )
                } else if (data.privateKey) {
                    // privateKey is empty
                    await deleteNodes({
                        client,
                        ids: [data.privateKey.nodeData.id],
                        authorization: authinfo.tokens,
                    })
                }

                // can fail, is wanted to crash
                const matchedPubKey = (values.publicKey.match(
                    /-----BEGIN PUBLIC KEY-----\s*(.+)\s*-----END PUBLIC KEY-----/m
                ) as string[])[1]
                // can fail, is wanted to crash
                const pubKey = await unserializeToCryptoKey(
                    matchedPubKey,
                    keyParams,
                    'publicKey',
                    true
                )
                if (
                    values.publicKey.trim() != initialValues.publicKey.trim() ||
                    (values.cluster &&
                        values.cluster != data.publicKey.nodeData.cluster.id)
                ) {
                    // delete and recreate
                    console.log('Public Key changed, recreate')
                    await deleteNodes({
                        client,
                        ids: [data.publicKey.nodeData.id],
                        authorization: authinfo.tokens,
                    })
                    // recursively deletes private key but it would still be visible, so do it here
                    if (data.privateKey && privKey) {
                        await deleteNodes({
                            client,
                            ids: [data.privateKey.nodeData.id],
                            authorization: authinfo.tokens,
                        })
                    }
                    const { data: newData } = await createKeys({
                        client,
                        config,
                        cluster: values.cluster,
                        publicKey: pubKey,
                        privateKey: privKey || undefined,
                        privkeys: Object.values(privkeys),
                        pubkeys: Object.values(pubkeys),
                        hashAlgorithm: data.hashAlgorithms[0],
                        authorization: authinfo.tokens,
                    })
                    updateMainCtx({
                        item: newData.updateOrCreateContent.content.id,
                        updateId:
                            newData.updateOrCreateContent.content.updateId,
                    })
                } else {
                    const { data: newData } = await updateKey({
                        id: data.publicKey.nodeData.id,
                        updateId: data.publicKey.nodeData.updateId,
                        client,
                        config,
                        privkeys: await Promise.all(Object.values(privkeys)),
                        pubkeys: Object.values(pubkeys),
                        hashAlgorithm: data.hashAlgorithms[0],
                        authorization: authinfo.tokens,
                    })
                    if (data.privateKey && privKey) {
                        await updateKey({
                            id: data.privateKey.nodeData.id,
                            updateId: data.privateKey.nodeData.updateId,
                            client,
                            config,
                            key: privKey,
                            privkeys: await Promise.all(
                                Object.values(privkeys)
                            ),
                            pubkeys: Object.values(pubkeys),
                            hashAlgorithm: data.hashAlgorithms[0],
                            authorization: authinfo.tokens,
                        })
                    } else if (privKey) {
                        await createKeys({
                            client,
                            config,
                            cluster: values.cluster,
                            publicKey: pubKey,
                            privateKey: privKey,
                            privkeys: Object.values(privkeys),
                            pubkeys: Object.values(pubkeys),
                            hashAlgorithm: data.hashAlgorithms[0],
                            authorization: authinfo.tokens,
                        })
                    }

                    if (privKey || data.privateKey) {
                        const halgo =
                            Constants.mapHashNames[data.hashAlgorithms[0]]
                        updateConfig(
                            await updateConfigRemoteReducer(config, {
                                update: {
                                    certificates: {
                                        [await serializeToBase64(
                                            crypto.subtle.digest(
                                                halgo.operationName,
                                                await crypto.subtle.exportKey(
                                                    'spki' as const,
                                                    pubKey
                                                )
                                            )
                                        )]: privKey
                                            ? {
                                                  data: await serializeToBase64(
                                                      privKey
                                                  ),
                                                  note: '',
                                              }
                                            : null,
                                    },
                                },
                                client: baseClient,
                            }),
                            true
                        )
                    }
                    updateMainCtx({
                        updateId:
                            newData.updateOrCreateContent.content.updateId,
                    })
                    // reload()
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
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx } = React.useContext(Contexts.Search)
    const client = useApolloClient()
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const { baseClient } = React.useContext(Contexts.Clients)
    const { data } = useAsync<ApolloQueryResult<any>>({
        promiseFn: client.query,
        onReject: console.error,
        suspense: true,
        query: serverConfigQuery,
    })
    const initialValues = {
        cluster: searchCtx.cluster as string | null,
        publicKey: '',
        privateKey: '',
    }

    return (
        <Formik
            initialValues={initialValues}
            validate={(values) => {
                const errors: Partial<
                    { [key in keyof typeof values]: string }
                > = {}
                if (!values.cluster) {
                    errors['cluster'] = 'empty'
                }
                if (!values.publicKey) {
                    errors['publicKey'] = 'empty'
                }
                return errors
            }}
            onSubmit={async (values, { setSubmitting, setValues }) => {
                const authinfo = extractAuthInfo({
                    config,
                    clusters: new Set([values.cluster as string]),
                    url: activeUrl,
                    require: new Set(['create', 'manage']),
                })

                // steps: sign with all other keys, if private key specified: create cryptotag
                const pubkeysResult = await client.query({
                    query: getContentConfigurationQuery,
                    variables: {
                        authorization: authinfo.tokens,
                        id: values.cluster,
                    },
                })

                const hashAlgorithm = config.hosts[activeUrl].hashAlgorithms[0]

                //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                const privkeys = extractPrivKeys({
                    config,
                    url: activeUrl,
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
                const pubkeys = extractPubKeysCluster({
                    node: pubkeysResult.data.secretgraph.node,
                    authorization: authinfo.tokens,
                    params: keyParams,
                })

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
                }
                // can fail, is wanted to crash
                const matchedPubKey = (values.publicKey.match(
                    /-----BEGIN PUBLIC KEY-----\s*(.+)\s*-----END PUBLIC KEY-----/m
                ) as string[])[1]
                const pubKey = await unserializeToCryptoKey(
                    matchedPubKey,
                    keyParams,
                    'publicKey'
                )
                const { data: newData } = await createKeys({
                    client,
                    config,
                    cluster: values.cluster as string,
                    publicKey: pubKey,
                    privateKey: privKey || undefined,
                    privkeys: Object.values(privkeys),
                    pubkeys: Object.values(pubkeys),
                    hashAlgorithm: hashAlgorithm,
                    authorization: authinfo.tokens,
                })
                updateMainCtx({
                    action: 'update',
                    url: activeUrl,
                    item: newData.updateOrCreateContent.content.id,
                    updateId: newData.updateOrCreateContent.content.updateId,
                })
                if (privKey) {
                    const halgo = Constants.mapHashNames[hashAlgorithm]
                    updateConfig(
                        await updateConfigRemoteReducer(config, {
                            update: {
                                certificates: {
                                    [await serializeToBase64(
                                        crypto.subtle.digest(
                                            halgo.operationName,
                                            await crypto.subtle.exportKey(
                                                'spki' as const,
                                                pubKey
                                            )
                                        )
                                    )]: {
                                        data: await serializeToBase64(privKey),
                                        note: '',
                                    },
                                },
                            },
                            client: baseClient,
                        }),
                        true
                    )
                }
            }}
        >
            {(formikProps) => {
                return (
                    <InnerKeys
                        hashAlgorithms={
                            data
                                ? data.data.secretgraph.config.hashAlgorithms
                                : []
                        }
                        url={activeUrl}
                        generateButton
                    />
                )
            }}
        </Formik>
    )
}

async function findOrReturn({
    client,
    config,
    id,
    url,
}: {
    client: ApolloClient<any>
    config: Interfaces.ConfigInterface
    id: string | null
    url: string | null
}) {
    if (!id || !url) {
        return true
    }
    const { tokens: authorization } = extractAuthInfo({
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
        return d.edges[0].node.target.id
    }
    return null
}

export default function KeyComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
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
        watch: mainCtx.url + '' + mainCtx.item,
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
