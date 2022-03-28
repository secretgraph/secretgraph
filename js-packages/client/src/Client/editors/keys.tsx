import {
    ApolloClient,
    ApolloError,
    ApolloQueryResult,
    useApolloClient,
    useQuery,
} from '@apollo/client'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import { Theme } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import {
    findPublicKeyQuery,
    getContentConfigurationQuery,
    keysRetrievalQuery,
} from '@secretgraph/graphql-queries/content'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    RequireAttributes,
    UnpackPromise,
    ValueType,
} from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import {
    authInfoFromConfig,
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

import DecisionFrame from '../components/DecisionFrame'
import FormikTextField from '../components/formik/FormikTextField'
import ClusterSelect from '../components/forms/ClusterSelect'
import StateSelect from '../components/forms/StateSelect'
import * as Contexts from '../contexts'
import { mapperToArray } from '../hooks'
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
        hashAlgorithmsRaw: data.secretgraph.config.hashAlgorithms,
    } as {
        hashAlgorithmsRaw: string[]
        hashAlgorithmsWorking: string[]
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
    results['hashAlgorithmsWorking'] = findWorkingHashAlgorithms(
        results['hashAlgorithmsRaw']
    )

    const keyParams = {
        name: 'RSA-OAEP',
        hash: Constants.mapHashNames[results['hashAlgorithmsWorking'][0]]
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
                        hashAlgorithms: results['hashAlgorithmsWorking'],
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
                            hashAlgorithms: results['hashAlgorithmsWorking'],
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

async function calcPublicKey(key: string, hashAlgorithm: string) {
    const keyParams = {
        name: 'RSA-OAEP',
        hash: Constants.mapHashNames[hashAlgorithm].operationName,
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
    hashAlgorithmsWorking,
    hashAlgorithmsRaw,
    generateButton,
    canSelectCluster,
}: {
    url: string
    disabled?: boolean
    hashAlgorithmsWorking: string[]
    hashAlgorithmsRaw: string[]
    generateButton?: boolean
    canSelectCluster: boolean
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
    const { config } = React.useContext(Contexts.InitializedConfig)
    React.useEffect(() => {
        let active = true
        calcHashes(values.publicKey, hashAlgorithmsWorking).then(
            (data) => {
                if (active) {
                    setJoinedHashes(data.join(', '))
                }
            },
            (reason) => {}
        )
        return () => {
            active = false
        }
    }, [])

    const clusterSelectTokens = React.useMemo(() => {
        return authInfoFromConfig({
            config,
            url: url as string,
            require: new Set(['create', 'manage']),
        }).tokens
    }, [config])
    return (
        <Form>
            <Grid container spacing={2}>
                <Grid item xs={12}>
                    <FastField
                        component={FormikTextField}
                        name="name"
                        fullWidth
                        label="Name"
                        disabled={isSubmitting || disabled}
                    />
                </Grid>
                <Grid item xs={12}>
                    <FastField
                        component={FormikTextField}
                        name="description"
                        fullWidth
                        multiline
                        label="Description"
                        disabled={isSubmitting || disabled}
                    />
                </Grid>
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
                    {canSelectCluster ? (
                        <Field
                            component={ClusterSelect}
                            url={url}
                            name="cluster"
                            disabled={isSubmitting || disabled}
                            label="Cluster"
                            firstIfEmpty
                            tokens={clusterSelectTokens}
                        />
                    ) : null}
                </Grid>
                <Grid item xs={12}>
                    <Field
                        component={StateSelect}
                        name="state"
                        disabled={isSubmitting || disabled}
                        label="State"
                        forKey
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12}>
                    <Field
                        name="publicKey"
                        component={FormikTextField}
                        validate={async (val: string) => {
                            // validate has side effects
                            // TODO: fix this
                            if (!val) {
                                setJoinedHashes('')
                                return 'empty'
                            }
                            return await calcHashes(
                                val,
                                hashAlgorithmsWorking
                            ).then(
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
                                calcPublicKey(
                                    val,
                                    hashAlgorithmsWorking[0]
                                ).then(
                                    async (data) => {
                                        setFieldValue('publicKey', data, true)
                                        await calcHashes(
                                            data,
                                            hashAlgorithmsWorking
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
                                    Constants.mapHashNames[
                                        hashAlgorithmsWorking[0]
                                    ].operationName
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
                                    )) as Required<CryptoKeyPair>
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
    hashAlgorithmsRaw: string[]
    hashAlgorithmsWorking: string[]
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
    setCluster?: (arg: string) => void
    url: string
}

const KeysIntern = ({
    hashAlgorithmsWorking,
    hashAlgorithmsRaw,
    publicKey,
    privateKey,
    setCluster,
    url,
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
        state: publicKey?.nodeData?.state,
        name: publicKey?.tags?.name ? publicKey.tags.name[0] : '',
        description: publicKey?.tags?.description
            ? publicKey.tags.description[0]
            : '',
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
                const errors: Partial<{
                    [key in keyof typeof values]: string
                }> = {}
                if (!values.publicKey) {
                    errors['publicKey'] = 'empty'
                }
                return errors
            }}
            onSubmit={async (values, { setSubmitting, setValues }) => {
                setSubmitting(true)
                try {
                    const keyParams = {
                        name: 'RSA-OAEP',
                        hash: hashAlgorithmsWorking[0],
                    }
                    let publicKeys: { [hash: string]: Promise<CryptoKey> } = {}
                    let privateKeys: { [hash: string]: Promise<CryptoKey> } = {}
                    let tokensTarget = mainCtx.tokens
                    if (publicKey) {
                        if (values.cluster != publicKey.nodeData.cluster.id) {
                            tokensTarget = mainCtx.tokens.concat(
                                authInfoFromConfig({
                                    config,
                                    clusters: new Set([values.cluster]),
                                    url: mainCtx.url as string,
                                    require: new Set(['create', 'manage']),
                                }).tokens
                            )
                        }

                        // steps: sign with all other keys, if private key specified: create cryptotag
                        const pubkeysResult = await client.query({
                            query: getContentConfigurationQuery,
                            variables: {
                                authorization: tokensTarget,
                                id: mainCtx.item,
                            },
                        })

                        //await client.query({                          query: serverConfigQuery,                      })) as any).data.secretgraph.config.hashAlgorithms[0]
                        privateKeys = extractPrivKeys({
                            config,
                            url: mainCtx.url as string,
                            hashAlgorithm: hashAlgorithmsWorking[0],
                        })
                        publicKeys = extractPubKeysCluster({
                            node: pubkeysResult.data.secretgraph.node,
                            authorization: tokensTarget,
                            params: keyParams,
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
                            authorization: mainCtx.tokens,
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
                        values.publicKey.trim() !=
                            initialValues.publicKey.trim() ||
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
                                authorization: mainCtx.tokens,
                            })
                            // recursively deletes private key but it would still be visible, so do it here
                            if (privateKey && privKey) {
                                await deleteNodes({
                                    client,
                                    ids: [privateKey.nodeData.id],
                                    authorization: mainCtx.tokens,
                                })
                            }
                        }
                        const { data: newData } = await createKeys({
                            client,
                            config,
                            cluster: values.cluster,
                            publicState: values.state,
                            privateTags: [
                                `description=${values.description}`,
                                `name=${values.name}`,
                            ],
                            publicTags: [
                                `description=${values.description}`,
                                `name=${values.name}`,
                            ],
                            publicKey: pubKey,
                            privateKey: privKey || undefined,
                            privkeys: Object.values(privateKeys),
                            pubkeys: Object.values(publicKeys),
                            hashAlgorithm: hashAlgorithmsWorking[0],
                            authorization: tokensTarget,
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
                            publicState: values.state,
                            publicTags: [
                                `description=${values.description}`,
                                `name=${values.name}`,
                            ],
                            privkeys: await Promise.all(
                                Object.values(privateKeys)
                            ),
                            pubkeys: Object.values(publicKeys),
                            hashAlgorithm: hashAlgorithmsWorking[0],
                            authorization: mainCtx.tokens,
                        })
                        if (privateKey && privKey) {
                            await updateKey({
                                id: privateKey.nodeData.id,
                                updateId: privateKey.nodeData.updateId,
                                client,
                                config,
                                key: privKey,
                                privateTags: [
                                    `description=${values.description}`,
                                    `name=${values.name}`,
                                ],
                                privkeys: await Promise.all(
                                    Object.values(privateKeys)
                                ),
                                pubkeys: Object.values(publicKeys),
                                hashAlgorithm: hashAlgorithmsWorking[0],
                                authorization: mainCtx.tokens,
                            })
                        } else if (privKey) {
                            await createKeys({
                                client,
                                config,
                                cluster: values.cluster,
                                publicKey: pubKey,
                                privateKey: privKey,
                                privateTags: [
                                    `description=${values.description}`,
                                    `name=${values.name}`,
                                ],
                                privkeys: Object.values(privateKeys),
                                pubkeys: Object.values(publicKeys),
                                hashAlgorithm: hashAlgorithmsWorking[0],
                                authorization: mainCtx.tokens,
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
                                                    hashAlgorithmsWorking[0],
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
                    }
                } catch (exc) {
                    console.error(exc)
                    setSubmitting(false)
                    throw exc
                }
            }}
        >
            {({ values }) => {
                React.useEffect(() => {
                    values.cluster && setCluster && setCluster(values.cluster)
                }, [values.cluster, setCluster])
                return (
                    <InnerKeys
                        hashAlgorithmsRaw={hashAlgorithmsRaw}
                        hashAlgorithmsWorking={hashAlgorithmsWorking}
                        url={mainCtx.url as string}
                        generateButton={!publicKey}
                        canSelectCluster={!!setCluster}
                    />
                )
            }}
        </Formik>
    )
}

const ViewKeys = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const theme = useTheme()
    const [data, setData] = React.useState<
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
        let active = true
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
            const res = await loadKeys({
                baseUrl: mainCtx.url as string,
                data: dataUnfinished,
                config,
                authorization: mainCtx.tokens,
            })
            if (active) {
                updateMainCtx(updateOb)
                setData({ ...res, key: `${new Date().getTime()}` })
            }
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished, config])
    if (!data) {
        return null
    }

    return (
        <Grid container spacing={2}>
            <Grid item xs={12}>
                <Typography variant="h5">Name</Typography>
                <Typography variant="body2">
                    {data.publicKey?.tags?.name
                        ? data.publicKey.tags.name[0]
                        : ''}
                </Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="h5">Description</Typography>
                <Typography variant="body2">
                    {data.publicKey?.tags?.description
                        ? data.publicKey.tags.description[0]
                        : ''}
                </Typography>
            </Grid>
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
                <Typography variant="h5">State</Typography>
                <Typography variant="body2" style={{ wordBreak: 'break-all' }}>
                    {theme.contentStatesKey.get(data.publicKey.nodeData.state)
                        ?.label || ''}
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
    const [data, setData] = React.useState<
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
        let active = true
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
                tokensPermissions: new Set([
                    ...mainCtx.tokensPermissions,
                    ...dataUnfinished.secretgraph.node.availableActions.map(
                        (val: { keyHash: string; type: string }) => val.type
                    ),
                ]),
            }
            for (const tag of dataUnfinished.secretgraph.node.tags) {
                if (tag.startsWith('key_hash=')) {
                    updateOb['title'] = tag.match(/=(.*)/)[1]
                    break
                }
            }
            const reskeys = await loadKeys({
                baseUrl: mainCtx.url as string,
                data: dataUnfinished,
                config,
                authorization: mainCtx.tokens,
            })
            if (active) {
                updateMainCtx(updateOb)
                setData({
                    ...reskeys,
                    key: `${new Date().getTime()}`,
                })
            }
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished, config])
    if (!data) {
        return null
    }

    return (
        <KeysIntern
            {...data}
            url={mainCtx.url as string}
            disabled={loading}
            setCluster={
                mainCtx.tokensPermissions.has('manage') ||
                mainCtx.tokensPermissions.has('delete')
                    ? setCluster
                    : undefined
            }
        />
    )
}

const CreateKeys = () => {
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
    const { tokens } = React.useMemo(() => {
        if (cluster) {
            return authInfoFromConfig({
                config,
                url: activeUrl,
                clusters: new Set([cluster]),
                require: new Set(['create', 'manage']),
            })
        }
        return { tokens: [] }
    }, [config, cluster, activeUrl])

    const authorization = React.useMemo(() => {
        return [...new Set([...mainCtx.tokens, ...tokens])]
    }, [tokens, mainCtx.tokens])

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
    const algos = React.useMemo(() => {
        const hashAlgorithmsRaw =
            data?.secretgraph?.config?.hashAlgorithms || []
        return {
            hashAlgorithmsRaw,
            hashAlgorithmsWorking: findWorkingHashAlgorithms(hashAlgorithmsRaw),
        }
    }, [data?.secretgraph?.config?.hashAlgorithms])
    return (
        <KeysIntern
            url={activeUrl}
            setCluster={setCluster}
            disabled={loading}
            {...algos}
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
}): Promise<string | null | true> {
    if (!id || !url) {
        return true
    }
    const { tokens: authorization } = authInfoFromConfig({
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
    if (node.type == 'PublicKey') {
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
    const [barrier, setBarrier] = React.useState<Promise<any> | undefined>(() =>
        Promise.resolve()
    )
    React.useEffect(() => {
        let active = true
        const f = async () => {
            const result = await findOrReturn({
                client,
                id:
                    mainCtx.action === 'create'
                        ? null
                        : (mainCtx.item as string | null),
                config,
                url: mainCtx.url,
            })
            if (active) {
                if (result === true) {
                    setBarrier(undefined)
                } else if (result) {
                    updateMainCtx({ item: result, type: 'PublicKey' })
                } else {
                    updateMainCtx({
                        item: null,
                        type: 'PublicKey',
                        action: 'create',
                    })
                }
            }
        }
        setBarrier(f())
        return () => {
            active = false
            setBarrier(Promise.resolve())
        }
    }, [mainCtx.url, mainCtx.item])
    if (barrier) {
        return null
        //throw barrier
    }
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            view={ViewKeys}
            edit={EditKeys}
            create={CreateKeys}
        />
    )
}
