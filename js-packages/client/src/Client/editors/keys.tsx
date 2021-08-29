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
import { useTheme } from '@material-ui/core/styles'
import Typography from '@material-ui/core/Typography'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    findPublicKeyQuery,
    getContentConfigurationQuery,
    keysRetrievalQuery,
} from '@secretgraph/misc/queries/content'
import { serverConfigQuery } from '@secretgraph/misc/queries/server'
import {
    RequireAttributes,
    UnpackPromise,
    ValueType,
} from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import {
    extractAuthInfo,
    extractPrivKeys,
} from '@secretgraph/misc/utils/config'
import {
    extractTags,
    extractUnencryptedTags,
    findWorkingHashAlgorithms,
    serializeToBase64,
    unserializeToArrayBuffer,
    unserializeToCryptoKey,
} from '@secretgraph/misc/utils/encryption'
import {
    extractPubKeysCluster,
    extractPubKeysReferences,
} from '@secretgraph/misc/utils/graphql'
import {
    createKeys,
    decryptContentObject,
    deleteNodes,
    updateConfigRemoteReducer,
    updateKey,
} from '@secretgraph/misc/utils/operations'
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
import * as React from 'react'
import { useAsync } from 'react-async'

import DecisionFrame from '../components/DecisionFrame'
import FormikTextField from '../components/formik/FormikTextField'
import ClusterSelect from '../components/forms/ClusterSelect'
import * as Contexts from '../contexts'
import { newClusterLabel } from '../messages'

async function loadKeys({
    data,
    config,
    baseUrl,
    authorization,
}: {
    data: any
    config: Interfaces.ConfigInterface
    baseUrl: string
    authorization: string[]
}) {
    const requests = []
    const results = {
        hashAlgorithms: data.secretgraph.config.hashAlgorithms,
    } as {
        hashAlgorithms: string[]
        publicKey: {
            tags: { [key: string]: string[] }
            data: ArrayBuffer
            nodeData: any
            mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
        }
        privateKey?: {
            tags: { [key: string]: string[] }
            data: ArrayBuffer
            nodeData: any
            mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
        }
    }

    const keyParams = {
        name: 'RSA-OAEP',
        hash: Constants.mapHashNames[results['hashAlgorithms'][0]]
            .operationName,
    }
    requests.push(
        fetch(new URL(data.secretgraph.node.link, baseUrl).href, {
            headers: {
                Authorization: authorization.join(','),
            },
        })
            .then(async (val) => {
                const host = config.hosts[baseUrl]
                const contentstuff =
                    host && host.contents[data.secretgraph.node.id]
                results['publicKey'] = {
                    tags: await extractUnencryptedTags({
                        tags: data.secretgraph.node.tags,
                    }),
                    data: await val.arrayBuffer(),
                    nodeData: data.secretgraph.node,
                    mapper: await generateActionMapper({
                        knownHashes: [
                            data.secretgraph.node.availableActions,
                            data.secretgraph.node?.cluster?.availableActions,
                            contentstuff &&
                                host.clusters[contentstuff.cluster]?.hashes,
                            contentstuff?.hashes,
                        ],
                        hashAlgorithm: findWorkingHashAlgorithms(
                            results.hashAlgorithms
                        )[0],
                        config,
                    }),
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
                    const host = config.hosts[baseUrl]
                    const contentstuff = host && host.contents[nodeData.id]
                    await unserializeToCryptoKey(
                        val.data,
                        keyParams,
                        'privateKey'
                    )
                    results['privateKey'] = {
                        data: val.data,
                        tags: val.tags,
                        nodeData: val.nodeData,
                        mapper: await generateActionMapper({
                            knownHashes: [
                                nodeData.availableActions,
                                nodeData?.cluster?.availableActions,
                                contentstuff &&
                                    host.clusters[contentstuff.cluster]?.hashes,
                                contentstuff?.hashes,
                            ],
                            hashAlgorithm: findWorkingHashAlgorithms(
                                results.hashAlgorithms
                            )[0],
                            config,
                        }),
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
    const matchedPrivKey = (
        key.match(
            /-----BEGIN PRIVATE KEY-----\s*(.+)\s*-----END PRIVATE KEY-----/m
        ) as string[]
    )[1]
    const publicKey = await unserializeToArrayBuffer(
        unserializeToCryptoKey(matchedPrivKey, keyParams, 'publicKey')
    )

    return `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKey).toString(
        'base64'
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
    const matchedPubKey = (
        key.match(
            /-----BEGIN PUBLIC KEY-----\s*(.+)\s*-----END PUBLIC KEY-----/m
        ) as string[]
    )[1]
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
                                const { publicKey, privateKey } =
                                    (await crypto.subtle.generateKey(
                                        {
                                            name: 'RSA-OAEP',
                                            modulusLength: 4096,
                                            publicExponent: new Uint8Array([
                                                1, 0, 1,
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

interface KeysInternProps {
    disabled?: boolean
    hashAlgorithms: string[]
    publicKey?: {
        tags: { [key: string]: string[] }
        data: ArrayBuffer
        nodeData: any
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    }
    privateKey?: {
        tags: { [key: string]: string[] }
        data: ArrayBuffer
        nodeData: any
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    }
    setCluster: (arg: string) => void
}

const KeysIntern = ({
    hashAlgorithms,
    publicKey,
    privateKey,
    setCluster,
}: KeysInternProps) => {
    const client = useApolloClient()
    const { baseClient } = React.useContext(Contexts.Clients)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const initialValues = {
        cluster:
            publicKey?.nodeData?.cluster?.id ||
            (searchCtx.cluster ? searchCtx.cluster : null),
        publicKey: publicKey
            ? `-----BEGIN PUBLIC KEY-----\n${Buffer.from(
                  publicKey.data
              ).toString('base64')}\n-----END PUBLIC KEY-----`
            : '',
        privateKey: privateKey
            ? `-----BEGIN PRIVATE KEY-----\n${Buffer.from(
                  privateKey.data
              ).toString('base64')}\n-----END PRIVATE KEY-----`
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
                const halgo = findWorkingHashAlgorithms(hashAlgorithms)[0]
                const keyParams = {
                    name: 'RSA-OAEP',
                    hash: halgo,
                }
                let publicKeys: { [hash: string]: Promise<CryptoKey> } = {}
                let privateKeys: { [hash: string]: Promise<CryptoKey> } = {}
                let authinfo
                if (publicKey) {
                    authinfo = extractAuthInfo({
                        config,
                        clusters: new Set([
                            values.cluster,
                            publicKey.nodeData.cluster.id,
                        ]),
                        url: mainCtx.url as string,
                        require: new Set([
                            'update',
                            'create',
                            'delete',
                            'manage',
                        ]),
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
                    privateKeys = extractPrivKeys({
                        config,
                        url: mainCtx.url as string,
                        hashAlgorithm: hashAlgorithms[0],
                    })
                    publicKeys = extractPubKeysCluster({
                        node: pubkeysResult.data.secretgraph.node,
                        authorization: authinfo.tokens,
                        params: keyParams,
                    })
                } else {
                    authinfo = extractAuthInfo({
                        config,
                        clusters: new Set([values.cluster]),
                        url: mainCtx.url as string,
                        require: new Set([
                            'update',
                            'create',
                            'delete',
                            'manage',
                        ]),
                    })
                }
                let privKey = null
                if (values.privateKey.trim()) {
                    // can fail, is wanted to crash
                    const matchedPrivKey = (
                        values.privateKey.match(
                            /-----BEGIN PRIVATE KEY-----\s*(.+)\s*-----END PRIVATE KEY-----/m
                        ) as string[]
                    )[1]
                    privKey = await unserializeToCryptoKey(
                        matchedPrivKey,
                        keyParams,
                        'privateKey',
                        true
                    )
                } else if (privateKey) {
                    // privateKey is empty
                    await deleteNodes({
                        client,
                        ids: [privateKey.nodeData.id],
                        authorization: authinfo.tokens,
                    })
                }

                // can fail, is wanted to crash
                const matchedPubKey = (
                    values.publicKey.match(
                        /-----BEGIN PUBLIC KEY-----\s*(.+)\s*-----END PUBLIC KEY-----/m
                    ) as string[]
                )[1]
                // can fail, is wanted to crash
                const pubKey = await unserializeToCryptoKey(
                    matchedPubKey,
                    keyParams,
                    'publicKey',
                    true
                )
                if (
                    values.publicKey.trim() != initialValues.publicKey.trim() ||
                    !publicKey ||
                    (values.cluster &&
                        values.cluster != publicKey.nodeData.cluster.id)
                ) {
                    if (publicKey) {
                        // delete and recreate
                        console.log('Public Key changed, recreate')
                        await deleteNodes({
                            client,
                            ids: [publicKey.nodeData.id],
                            authorization: authinfo.tokens,
                        })
                        // recursively deletes private key but it would still be visible, so do it here
                        if (privateKey && privKey) {
                            await deleteNodes({
                                client,
                                ids: [privateKey.nodeData.id],
                                authorization: authinfo.tokens,
                            })
                        }
                    }
                    const { data: newData } = await createKeys({
                        client,
                        config,
                        cluster: values.cluster,
                        publicKey: pubKey,
                        privateKey: privKey || undefined,
                        privkeys: Object.values(privateKeys),
                        pubkeys: Object.values(publicKeys),
                        hashAlgorithm: halgo,
                        authorization: authinfo.tokens,
                    })
                    updateMainCtx({
                        item: newData.updateOrCreateContent.content.id,
                        updateId:
                            newData.updateOrCreateContent.content.updateId,
                    })
                } else {
                    const { data: newData } = await updateKey({
                        id: publicKey.nodeData.id,
                        updateId: publicKey.nodeData.updateId,
                        client,
                        config,
                        privkeys: await Promise.all(Object.values(privateKeys)),
                        pubkeys: Object.values(publicKeys),
                        hashAlgorithm: halgo,
                        authorization: authinfo.tokens,
                    })
                    if (privateKey && privKey) {
                        await updateKey({
                            id: privateKey.nodeData.id,
                            updateId: privateKey.nodeData.updateId,
                            client,
                            config,
                            key: privKey,
                            privkeys: await Promise.all(
                                Object.values(privateKeys)
                            ),
                            pubkeys: Object.values(publicKeys),
                            hashAlgorithm: halgo,
                            authorization: authinfo.tokens,
                        })
                    } else if (privKey) {
                        await createKeys({
                            client,
                            config,
                            cluster: values.cluster,
                            publicKey: pubKey,
                            privateKey: privKey,
                            privkeys: Object.values(privateKeys),
                            pubkeys: Object.values(publicKeys),
                            hashAlgorithm: halgo,
                            authorization: authinfo.tokens,
                        })
                    }

                    if (privKey || privateKey) {
                        const configNew = await updateConfigRemoteReducer(
                            config,
                            {
                                update: {
                                    certificates: {
                                        [await serializeToBase64(
                                            crypto.subtle.digest(
                                                halgo,
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
                            }
                        )
                        updateConfig(configNew, true)
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
                        hashAlgorithms={hashAlgorithms}
                        url={mainCtx.url as string}
                        generateButton={!publicKey}
                    />
                )
            }}
        </Formik>
    )
}

const ViewKeys = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] =
        React.useState<
            | (UnpackPromise<ReturnType<typeof loadKeys>> & {
                  key: string
              })
            | null
        >(null)
    const { data: dataUnfinished, refetch } = useQuery(keysRetrievalQuery, {
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
        if (data) {
            refetch()
        }
    }, [mainCtx.updateId])

    React.useEffect(() => {
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            const updateOb: Partial<Interfaces.MainContextInterface> = {
                deleted: dataUnfinished.secretgraph.node.deleted,
                updateId: dataUnfinished.secretgraph.node.updateId,
            }
            for (const tag of dataUnfinished.secretgraph.node.tags) {
                if (tag.startsWith('key_hash=')) {
                    updateOb['title'] = tag.match(/=(.*)/)[1]
                    break
                }
            }
            updateMainCtx(updateOb)
            setData({
                ...(await loadKeys({
                    baseUrl: mainCtx.url as string,
                    data: dataUnfinished,
                    config,
                    authorization: mainCtx.tokens,
                })),
                key: `${new Date().getTime()}`,
            })
        }
        f()
    }, [dataUnfinished, config])
    if (!data) {
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
                    {`-----BEGIN PUBLIC KEY-----\n${Buffer.from(
                        data.publicKey.data
                    ).toString('base64')}\n-----END PUBLIC KEY-----`}
                </Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="h5">Private Key</Typography>
                <Typography
                    variant="body2"
                    style={{ whiteSpace: 'pre-line', wordBreak: 'break-all' }}
                >
                    {data.privateKey
                        ? `-----BEGIN PRIVATE KEY-----\n${Buffer.from(
                              data.privateKey.data
                          ).toString('base64')}\n-----END PRIVATE KEY-----`
                        : '-'}
                </Typography>
            </Grid>
        </Grid>
    )
}
const EditKeys = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const [cluster, setCluster] = React.useState<string | null>(null)
    const [data, setData] =
        React.useState<
            | (UnpackPromise<ReturnType<typeof loadKeys>> & {
                  key: string
              })
            | null
        >(null)
    let {
        refetch,
        data: dataUnfinished,
        loading,
    } = useQuery(keysRetrievalQuery, {
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
            loading = true
            refetch()
        }
    }, [mainCtx.updateId, cluster])

    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        if (!cluster) {
            if (!dataUnfinished.secretgraph.node.cluster.id) {
                throw Error('no cluster found')
            }
            setCluster(dataUnfinished.secretgraph.node.cluster.id)
        }
        const f = async () => {
            const updateOb: Partial<Interfaces.MainContextInterface> = {
                deleted: dataUnfinished.secretgraph.node.deleted,
                updateId: dataUnfinished.secretgraph.node.updateId,
            }
            for (const tag of dataUnfinished.secretgraph.node.tags) {
                if (tag.startsWith('key_hash=')) {
                    updateOb['title'] = tag.match(/=(.*)/)[1]
                    break
                }
            }
            updateMainCtx(updateOb)
            setData({
                ...(await loadKeys({
                    baseUrl: mainCtx.url as string,
                    data: dataUnfinished,
                    config,
                    authorization: mainCtx.tokens,
                })),
                key: `${new Date().getTime()}`,
            })
        }
        f()
    }, [dataUnfinished, config])
    if (!data) {
        return null
    }

    return <KeysIntern {...data} disabled={loading} setCluster={setCluster} />
}

const AddKeys = () => {
    const theme = useTheme()
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const [cluster, setCluster] = React.useState(
        searchCtx.cluster || config.configCluster
    )

    const tokens = React.useMemo(
        () =>
            cluster
                ? extractAuthInfo({
                      config,
                      url: activeUrl,
                      clusters: new Set([cluster]),
                      require: new Set(['create', 'manage']),
                  }).tokens
                : [],
        [config, cluster, activeUrl]
    )
    const authorization = React.useMemo(
        () => [...new Set([...mainCtx.tokens, ...tokens])],
        [tokens, mainCtx.tokens]
    )

    const { data, loading, refetch } = useQuery(getContentConfigurationQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            variables: {
                id: cluster || '',
                authorization,
            },
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (data) {
            refetch()
        }
    }, [cluster])
    const initialValues = {
        cluster,
        publicKey: '',
        privateKey: '',
    }

    return (
        <KeysIntern
            hashAlgorithms={data?.secretgraph?.config?.hashAlgorithms || []}
            setCluster={setCluster}
            disabled={loading}
        />
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
