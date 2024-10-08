import { ApolloClient, useApolloClient, useQuery } from '@apollo/client'
import DownloadIcon from '@mui/icons-material/Download'
import SecurityIcon from '@mui/icons-material/Security'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Box from '@mui/system/Box'
import {
    contentFeedQuery,
    findOriginsQuery,
    getContentConfigurationQuery,
} from '@secretgraph/graphql-queries/content'
import { keysRetrievalQuery } from '@secretgraph/graphql-queries/key'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { MaybePromise, UnpackPromise } from '@secretgraph/misc/typing'
import {
    generateActionMapper,
    transformActions,
} from '@secretgraph/misc/utils/action'
import {
    authInfoFromConfig,
    extractPrivKeys,
    mergeUpdates,
} from '@secretgraph/misc/utils/config'
import {
    serializeToBase64,
    unserializeToArrayBuffer,
} from '@secretgraph/misc/utils/encoding'
import { extractTagsRaw } from '@secretgraph/misc/utils/encryption'
import { hashObject } from '@secretgraph/misc/utils/hashing'
import {
    DEFAULT_SIGNATURE_ALGORITHM,
    hashKey,
    toPublicKey,
    findWorkingAlgorithms,
    generateEncryptionKey,
    DEFAULT_ASYMMETRIC_ENCRYPTION_ALGORITHM,
} from '@secretgraph/misc/utils/crypto'
import { fallback_fetch } from '@secretgraph/misc/utils/misc'
import { updateConfigRemoteReducer } from '@secretgraph/misc/utils/operations/config'
import { decryptContentObject } from '@secretgraph/misc/utils/operations/content'
import { createKeys, updateKey } from '@secretgraph/misc/utils/operations/key'
import { deleteNodes } from '@secretgraph/misc/utils/operations/node'
import { extractPubKeysReferences } from '@secretgraph/misc/utils/references'
import * as SetOps from '@secretgraph/misc/utils/set'
import FormikTextField from '@secretgraph/ui-components//formik/FormikTextField'
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import FormikCheckboxWithLabel from '@secretgraph/ui-components/formik/FormikCheckboxWithLabel'
import StateSelect from '@secretgraph/ui-components/forms/StateSelect'
import { saveAs } from 'file-saver'
import {
    FastField,
    Field,
    FieldArray,
    FieldArrayRenderProps,
    FieldProps,
    Form,
    Formik,
    useFormikContext,
} from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import ClusterSelectViaUrl from '../components/formsWithContext/ClusterSelectViaUrl'
import * as Contexts from '../contexts'
import { mappersToArray } from '../hooks'

async function loadKeys({
    data,
    config,
    baseUrl,
    authorization,
    client,
}: {
    data: any
    config: Interfaces.ConfigInterface
    baseUrl: string
    authorization: string[]
    client: ApolloClient<any>
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
            signWith: boolean
            mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
        }
    }
    results['hashAlgorithmsWorking'] = findWorkingAlgorithms(
        results['hashAlgorithmsRaw'],
        'hash'
    )

    const keyParams = {
        name: 'RSA-OAEP',
        hash: 'SHA-512',
    }
    requests.push(
        fallback_fetch(new URL(data.secretgraph.node.link, baseUrl), {
            headers: {
                Authorization: authorization.join(','),
            },
        })
            .then(async (val) => {
                const host = config.hosts[baseUrl]
                const contentstuff =
                    host && host.contents[data.secretgraph.node.id]
                results['publicKey'] = {
                    tags: await extractTagsRaw({
                        tags: data.secretgraph.node.tags,
                    }),
                    data: await val.arrayBuffer(),
                    nodeData: data.secretgraph.node,
                    mapper: await generateActionMapper({
                        knownHashesCluster: [
                            data.secretgraph.node?.cluster?.availableActions,
                            contentstuff &&
                                host.clusters[contentstuff.cluster]?.hashes,
                        ],
                        knownHashesContent: [
                            data.secretgraph.node.availableActions,
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
        const nodeData =
            data.secretgraph.node.referencedBy.edges[0].node.source
        requests.push(
            decryptContentObject({
                config,
                nodeData,
                blobOrTokens: authorization,
                itemDomain: baseUrl,
                transferClient: client,
            }).then(
                async (val) => {
                    //console.log(val, config, nodeData, authorization)
                    if (!val) {
                        return
                    }
                    const host = config.hosts[baseUrl]
                    const contentstuff = host && host.contents[nodeData.id]
                    const clusterstuff =
                        host &&
                        nodeData?.cluster?.id &&
                        host.clusters[nodeData.cluster.id]
                    await toPublicKey(val.data, { algorithm: 'rsa-sha512' })
                    let certificateInConfigHash = null
                    for (const tag of (nodeData?.tags || []) as string[]) {
                        if (
                            tag.startsWith('key_hash=') &&
                            config.certificates[tag.slice(9)]
                        ) {
                            certificateInConfigHash = tag.slice(9)
                            break
                        }
                    }

                    results['privateKey'] = {
                        data: val.data,
                        tags: val.tags,
                        signWith: certificateInConfigHash
                            ? config.signWith[config.slots[0]].includes(
                                  certificateInConfigHash
                              )
                            : false,
                        nodeData: val.nodeData,
                        mapper: await generateActionMapper({
                            knownHashesContent: [
                                nodeData.availableActions,
                                contentstuff?.hashes,
                            ],
                            knownHashesCluster: [
                                nodeData?.cluster?.availableActions,
                                contentstuff &&
                                    host.clusters[contentstuff.cluster]
                                        ?.hashes,
                                clusterstuff && clusterstuff.hashes,
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

async function calcPublicKey(key: string) {
    // can fail, fail wanted
    const matchedPrivKey = (
        key.match(
            /-----BEGIN PRIVATE KEY-----\s*(.+)\s*-----END PRIVATE KEY-----/m
        ) as string[]
    )[1]
    // convert
    const publicKey = await toPublicKey(matchedPrivKey, {
        algorithm: 'rsa-sha512',
    })

    return `-----BEGIN PUBLIC KEY-----\n${Buffer.from(publicKey.key).toString(
        'base64'
    )}\n-----END PUBLIC KEY-----`
}

async function calcHashes(key: string, hashAlgorithms: string[]) {
    if (hashAlgorithms.length == 0) {
        return []
    }
    // can fail, fail wanted
    const matchedPubKey = (
        key.match(
            /-----BEGIN PUBLIC KEY-----\s*(.+)\s*-----END PUBLIC KEY-----/m
        ) as string[]
    )[1]
    const rawKey = await unserializeToArrayBuffer(matchedPubKey)
    return await Promise.all(
        hashAlgorithms.map(async (algo) => {
            return await hashObject(rawKey, algo)
        })
    )
}

function UpdateKeysForm({
    url,
    hashAlgorithmsWorking,
    generateButton,
    canSelectCluster,
    viewOnly,
    disabled,
}: {
    url: string
    hashAlgorithmsWorking: string[]
    hashAlgorithmsRaw: string[]
    generateButton?: boolean
    viewOnly?: boolean
    disabled?: boolean
    canSelectCluster: boolean
}) {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const {
        submitForm,
        isSubmitting,
        setValues,
        setFieldValue,
        setFieldError,
        errors,
        setErrors,
        values,
        touched,
        dirty,
    } = useFormikContext<any>()

    const updateCallbacks = React.useCallback((callbacks: string[]) => {
        const ncallbacks = callbacks.filter((val) => val)
        ncallbacks.sort()
        if (
            ncallbacks.length == 0 ||
            ncallbacks[ncallbacks.length - 1] != ''
        ) {
            ncallbacks.push('')
        }
        setFieldValue('callbacks', ncallbacks)
    }, [])
    const [joinedHashes, setJoinedHashes] = React.useState<string>('loading')
    React.useEffect(() => {
        let active = true
        async function fn() {
            if (!values.publicKey) {
                setJoinedHashes('')
                setFieldError('publicKey', 'Empty')
                return
            }
            try {
                const data = await calcHashes(
                    values.publicKey,
                    hashAlgorithmsWorking
                )
                if (!active) return
                setJoinedHashes(data.join(', '))
                setFieldError('publicKey', undefined)
            } catch (error) {
                if (!active) return
                console.debug('error', error)
                setJoinedHashes('')
                setFieldError('publicKey', 'Invalid Key')
            }
        }
        fn()
        return () => {
            active = false
        }
    }, [values.publicKey])

    const [showKey, toggleShowKey] = React.useReducer(
        (state: boolean) => !state,
        false
    )

    disabled = disabled || viewOnly || isSubmitting
    return (
        <Form>
            <FieldArray name="actions">
                {({ remove, replace, push, form }: FieldArrayRenderProps) => {
                    return (
                        <ActionsDialog
                            hashAlgorithm={hashAlgorithmsWorking[0]}
                            remove={remove}
                            replace={replace}
                            push={push}
                            form={form}
                            disabled={disabled}
                            handleClose={() =>
                                updateMainCtx({ openDialog: null })
                            }
                            open={mainCtx.openDialog == 'private'}
                            isContent
                            isPublic={false}
                            fieldname="actions"
                            title="Access Control of Private Key"
                            preselectedValidFor={['PrivateKey']}
                            validFor={['PrivateKey']}
                            validForOptions={['PrivateKey']}
                        />
                    )
                }}
            </FieldArray>
            <FieldArray name="actions">
                {({ remove, replace, push, form }: FieldArrayRenderProps) => {
                    return (
                        <ActionsDialog
                            hashAlgorithm={hashAlgorithmsWorking[0]}
                            remove={remove}
                            replace={replace}
                            push={push}
                            form={form}
                            disabled={disabled}
                            handleClose={() =>
                                updateMainCtx({ openDialog: null })
                            }
                            open={mainCtx.openDialog == 'public'}
                            isContent
                            isPublic={values.state == 'public'}
                            fieldname="actions"
                            title="Access Control of Public Key"
                            preselectedValidFor={['PublicKey']}
                            validFor={['PublicKey']}
                            validForOptions={['PublicKey']}
                        />
                    )
                }}
            </FieldArray>
            <Stack spacing={2}>
                <FastField
                    component={FormikTextField}
                    name="name"
                    fullWidth
                    label="Name"
                    disabled={disabled}
                />
                <FastField
                    component={FormikTextField}
                    name="description"
                    fullWidth
                    multiline
                    label="Description"
                    disabled={disabled}
                />
                <Box
                    sx={{
                        padding: (theme) => theme.spacing(2, 0, 4, 0),
                    }}
                >
                    <Typography variant="h5">Callbacks</Typography>
                    {values.callbacks.map((tag: string, index: number) => (
                        <Field
                            name={`callbacks[${index}]`}
                            key={index}
                            validate={(val: string) => {
                                if (!val) {
                                    return undefined
                                }
                                try {
                                    new URL(val)
                                } catch (e) {
                                    return 'Invalid callback url'
                                }
                            }}
                        >
                            {(formikFieldProps: FieldProps) => {
                                return (
                                    <FormikTextField
                                        {...formikFieldProps}
                                        sx={{
                                            paddingLeft: (theme) =>
                                                theme.spacing(2),
                                            marginTop: (theme) =>
                                                theme.spacing(2),
                                        }}
                                        fullWidth
                                        disabled={disabled || isSubmitting}
                                        onBlur={(ev) => {
                                            updateCallbacks(values.callbacks)
                                            formikFieldProps.field.onBlur(ev)
                                        }}
                                        onKeyUp={(ev) => {
                                            if (ev.code === 'Enter') {
                                                updateCallbacks(
                                                    values.callbacks
                                                )
                                            }
                                        }}
                                    />
                                )
                            }}
                        </Field>
                    ))}
                </Box>
                <div>
                    <Typography variant="h5" gutterBottom>
                        Key hashes
                    </Typography>
                    <Typography
                        variant="body2"
                        style={{
                            wordBreak: 'break-all',
                            whiteSpace: 'pre-line',
                        }}
                    >
                        {joinedHashes}
                    </Typography>
                </div>
                {canSelectCluster ? (
                    <Field
                        component={ClusterSelectViaUrl}
                        url={url}
                        name="cluster"
                        disabled={disabled}
                        label="Cluster"
                        firstIfEmpty
                    />
                ) : null}
                <Field
                    component={StateSelect}
                    name="state"
                    disabled={disabled}
                    label="State of Public Key"
                    forKey
                    fullWidth
                />
                <div>
                    <Typography variant="h5" gutterBottom>
                        Public Key
                    </Typography>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            flexWrap: 'nowrap',
                            alignContent: 'flex-start',
                        }}
                    >
                        {viewOnly ? (
                            <Typography
                                variant="body2"
                                style={{
                                    whiteSpace: 'pre-line',
                                    wordBreak: 'break-all',
                                }}
                            >
                                {values.publicKey}
                            </Typography>
                        ) : (
                            <Field
                                name="publicKey"
                                component={FormikTextField}
                                fullWidth
                                disabled={
                                    disabled ||
                                    (!SetOps.hasIntersection(
                                        mainCtx.tokensPermissions,
                                        ['create', 'manage']
                                    ) &&
                                        touched.cluster)
                                }
                                multiline
                                minRows={4}
                                variant="outlined"
                                required
                            />
                        )}
                        <div>
                            <Tooltip title="Save">
                                <span>
                                    <IconButton
                                        disabled={!values.publicKey}
                                        onClick={(event) => {
                                            saveAs(
                                                new File(
                                                    [values.publicKey],
                                                    'pubkey.pem',
                                                    {
                                                        type: 'text/plain;charset=utf-8',
                                                    }
                                                )
                                            )
                                        }}
                                    >
                                        <DownloadIcon />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </div>
                        <div>
                            <Tooltip title="Public Key Actions">
                                <span>
                                    <IconButton
                                        onClick={() =>
                                            updateMainCtx({
                                                openDialog: 'public',
                                            })
                                        }
                                    >
                                        <SecurityIcon />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </div>
                    </div>
                </div>
                <div>
                    <Typography variant="h5" gutterBottom>
                        Private Key
                    </Typography>
                    <Stack direction="row" alignContent="flex-start">
                        {viewOnly ? (
                            <>
                                <Typography
                                    variant="body2"
                                    style={{
                                        whiteSpace: 'pre-line',
                                        wordBreak: 'break-all',
                                        flexGrow: 1,
                                    }}
                                >
                                    {values.privateKey
                                        ? showKey
                                            ? values.privateKey
                                            : '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
                                        : '-'}
                                </Typography>
                                {values.privateKey && (
                                    <>
                                        <div>
                                            <Tooltip
                                                title={
                                                    showKey ? 'Hide' : 'Show'
                                                }
                                            >
                                                <IconButton
                                                    onClick={toggleShowKey}
                                                >
                                                    {showKey ? (
                                                        <VisibilityIcon />
                                                    ) : (
                                                        <VisibilityOffIcon />
                                                    )}
                                                </IconButton>
                                            </Tooltip>
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <Field
                                name="privateKey"
                                validate={(val: string) => {
                                    if (val) {
                                        calcPublicKey(val).then(
                                            (data) => {
                                                if (values.publicKey != data) {
                                                    console.debug(
                                                        'Generate public key'
                                                    )
                                                    setFieldValue(
                                                        'publicKey',
                                                        data,
                                                        true
                                                    )
                                                }
                                                return null
                                            },
                                            (reason) => {
                                                console.debug(
                                                    'generating public key failed',
                                                    reason
                                                )
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
                                            disabled={disabled}
                                            type={
                                                showKey ? 'text' : 'password'
                                            }
                                            multiline={showKey}
                                            minRows={showKey ? 4 : undefined}
                                            InputProps={{
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <Tooltip
                                                            title={
                                                                showKey
                                                                    ? 'Hide'
                                                                    : 'Show'
                                                            }
                                                        >
                                                            <IconButton
                                                                onClick={(
                                                                    event
                                                                ) => {
                                                                    event.preventDefault()
                                                                    event.stopPropagation()
                                                                    toggleShowKey()
                                                                }}
                                                            >
                                                                {showKey ? (
                                                                    <VisibilityOffIcon />
                                                                ) : (
                                                                    <VisibilityIcon />
                                                                )}
                                                            </IconButton>
                                                        </Tooltip>
                                                    </InputAdornment>
                                                ),
                                            }}
                                        />
                                    )
                                }}
                            </Field>
                        )}
                        <div>
                            <Tooltip title="Save">
                                <span>
                                    <IconButton
                                        disabled={!values.privateKey}
                                        onClick={(event) => {
                                            saveAs(
                                                new File(
                                                    [values.privateKey],
                                                    'privkey.pem',
                                                    {
                                                        type: 'text/plain;charset=utf-8',
                                                    }
                                                )
                                            )
                                        }}
                                    >
                                        <DownloadIcon />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </div>
                        <div>
                            <Tooltip title="Private Key Actions">
                                <span>
                                    <IconButton
                                        onClick={() =>
                                            updateMainCtx({
                                                openDialog: 'private',
                                            })
                                        }
                                        disabled={!values.privateKey}
                                    >
                                        <SecurityIcon />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </div>
                    </Stack>
                </div>
                <div>
                    {generateButton && !viewOnly && (
                        <Box
                            sx={{ marginRight: (theme) => theme.spacing(2) }}
                            component="span"
                        >
                            <Button
                                variant="contained"
                                color="primary"
                                disabled={disabled}
                                onClick={async () => {
                                    const privateKey =
                                        await generateEncryptionKey({
                                            params: { bits: 4096 },
                                            algorithm:
                                                DEFAULT_ASYMMETRIC_ENCRYPTION_ALGORITHM,
                                        })
                                    const publicKey = await toPublicKey(
                                        privateKey.key,
                                        {
                                            algorithm:
                                                DEFAULT_ASYMMETRIC_ENCRYPTION_ALGORITHM,
                                        }
                                    )
                                    await setValues(
                                        {
                                            ...values,
                                            publicKey: `-----BEGIN PUBLIC KEY-----\n${await serializeToBase64(
                                                publicKey.key
                                            )}\n-----END PUBLIC KEY-----`,
                                            privateKey: `-----BEGIN PRIVATE KEY-----\n${await serializeToBase64(
                                                privateKey.key
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
                        </Box>
                    )}
                    <Field
                        name="signWith"
                        type="checkbox"
                        Label={{ label: 'Sign updates with Private Key' }}
                        disabled={disabled || !values.privateKey}
                        component={FormikCheckboxWithLabel}
                    />
                </div>
                {/*
                    <Field
                        component={FormikTextField}
                        name="password"
                        type="password"
                        fullWidth
                        label="Password"
                        disabled={disabled}
                        variant="outlined"
                    />*/}
                <div>{isSubmitting && <LinearProgress />}</div>
                <div>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={disabled || !dirty}
                        onClick={submitForm}
                    >
                        Submit
                    </Button>
                </div>
            </Stack>
        </Form>
    )
}

interface KeysUpdateProps {
    viewOnly?: boolean
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
        signWith: boolean
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    }
    canSelectCluster: boolean
    url: string
}

const KeysUpdate = ({
    hashAlgorithmsWorking,
    hashAlgorithmsRaw,
    publicKey,
    privateKey,
    canSelectCluster,
    url,
    viewOnly,
    disabled,
}: KeysUpdateProps) => {
    const client = useApolloClient()
    const { baseClient } = React.useContext(Contexts.Clients)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )

    const actions = mappersToArray(
        [publicKey?.mapper || {}, privateKey?.mapper || {}],
        {
            lockExisting: !!mainCtx.item,
            validFor: ['PublicKey', 'PrivateKey'],
        }
    )
    const callbacks = publicKey?.tags?.callbacks
        ? publicKey.tags.callbacks
        : []
    if (callbacks.length == 0 && !viewOnly) {
        callbacks.push('')
    }
    const initialValues = {
        cluster: mainCtx.editCluster,
        state: publicKey?.nodeData?.state,
        name: publicKey?.tags?.name ? publicKey.tags.name[0] : '',
        description: publicKey?.tags?.description
            ? publicKey.tags.description[0]
            : '',
        callbacks,
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
        signWith: privateKey ? privateKey.signWith : false,
        actions,
    }
    return (
        <Formik
            initialValues={initialValues}
            onSubmit={async (values, { setSubmitting }) => {
                try {
                    if (!values.cluster) {
                        throw Error('Cluster not set')
                    }
                    const {
                        hashes: hashesPublicKey,
                        actions: finishedActionsPublicKey,
                        configUpdate: configUpdatePublicKey,
                    } = await transformActions({
                        actions: values.actions,
                        mapper: privateKey?.mapper,
                        config,
                        hashAlgorithm: hashAlgorithmsWorking[0],
                        validFor: 'PublicKey',
                    })
                    const keyParams = {
                        name: 'RSA-OAEP',
                        hash: 'SHA-512',
                    }
                    let publicKeys: {
                        [hash: string]: MaybePromise<ArrayBuffer>
                    } = {}
                    let privateKeys: {
                        [hash: string]: MaybePromise<ArrayBuffer>
                    } = {}
                    let tokensTarget = mainCtx.tokens
                    if (publicKey) {
                        if (values.cluster != publicKey.nodeData.cluster.id) {
                            tokensTarget = mainCtx.tokens.concat(
                                authInfoFromConfig({
                                    config,
                                    clusters: new Set([values.cluster]),
                                    url,
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
                            url,
                            onlySignKeys: true,
                        })
                        // we only encrypt for seen references, ignoring all injected or trusted keys
                        publicKeys = extractPubKeysReferences({
                            node: pubkeysResult.data.secretgraph.node,
                            authorization: tokensTarget,
                            hashAlgorithm: keyParams.hash,
                            source: privateKeys,
                            onlySeen: true,
                            itemDomain: mainCtx.url || '/',
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
                        privKey = await unserializeToArrayBuffer(
                            matchedPrivKey
                        )
                    } else if (privateKey) {
                        // privateKey is empty
                        await deleteNodes({
                            client,
                            ids: [privateKey.nodeData.id],
                            authorization: mainCtx.tokens,
                        })
                    }

                    const {
                        actions: finishedActionsPrivateKey,
                        configUpdate: configUpdatePrivateKey,
                    } = privKey
                        ? await transformActions({
                              actions: values.actions,
                              mapper: privateKey?.mapper,
                              config,
                              hashAlgorithm: hashAlgorithmsWorking[0],
                              validFor: 'PrivateKey',
                          })
                        : {
                              actions: [],
                              configUpdate: {},
                          }

                    // can fail, is wanted to crash
                    const matchedPubKey = (
                        values.publicKey.match(
                            /-----BEGIN PUBLIC KEY-----\s*(.+)\s*-----END PUBLIC KEY-----/m
                        ) as string[]
                    )[1]
                    const pubKey = await unserializeToArrayBuffer(
                        matchedPubKey
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
                                ...values.callbacks
                                    .filter((val) => val)
                                    .map((callback) => `callback=${callback}`),
                            ],
                            publicKey: unserializeToArrayBuffer(pubKey),
                            privateKey: privKey
                                ? unserializeToArrayBuffer(privKey)
                                : undefined,
                            privkeys: Object.values(privateKeys),
                            pubkeys: Object.values(publicKeys),
                            publicActions: finishedActionsPublicKey,
                            privateActions: finishedActionsPrivateKey,
                            hashAlgorithm: hashAlgorithmsWorking[0],
                            authorization: tokensTarget,
                        })
                        updateMainCtx({
                            item: newData.secretgraph.updateOrCreateContent
                                .content.id,
                            updateId:
                                newData.secretgraph.updateOrCreateContent
                                    .content.updateId,
                            cloneData: null,

                            editCluster: values.cluster,
                            currentCluster: values.cluster,
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
                                ...values.callbacks
                                    .filter((val) => val)
                                    .map((callback) => `callback=${callback}`),
                            ],
                            privkeys: Object.values(privateKeys),
                            pubkeys: Object.values(publicKeys),
                            actions: finishedActionsPublicKey,

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
                                isPrivateKey: true,
                                // encrypted shared key will be added
                                privateTags: [
                                    `description=${values.description}`,
                                    `name=${values.name}`,
                                ],
                                privkeys: Object.values(privateKeys),
                                pubkeys: Object.values(publicKeys),
                                actions: finishedActionsPrivateKey,
                                hashAlgorithm: hashAlgorithmsWorking[0],
                                authorization: mainCtx.tokens,
                            })
                        } else if (privKey) {
                            // create new private key (and if not available public key)
                            await createKeys({
                                client,
                                config,
                                cluster: values.cluster,
                                publicKey: unserializeToArrayBuffer(pubKey),
                                privateKey: unserializeToArrayBuffer(privKey),
                                publicTags: [
                                    `description=${values.description}`,
                                    `name=${values.name}`,
                                    ...values.callbacks.map(
                                        (callback) => `callback=${callback}`
                                    ),
                                ],
                                // encrypted shared key will be added
                                privateTags: [
                                    `description=${values.description}`,
                                    `name=${values.name}`,
                                ],
                                privateActions: finishedActionsPrivateKey,
                                privkeys: Object.values(privateKeys),
                                pubkeys: Object.values(publicKeys),
                                hashAlgorithm: hashAlgorithmsWorking[0],
                                authorization: mainCtx.tokens,
                            })
                        }
                        await client.refetchQueries({
                            include: [
                                getContentConfigurationQuery,
                                contentFeedQuery,
                            ],
                        })
                        updateMainCtx({
                            updateId:
                                newData.secretgraph.updateOrCreateContent
                                    .content.updateId,
                            cloneData: null,

                            editCluster: values.cluster,
                            currentCluster: values.cluster,
                        })
                    }
                    const configUpdate = mergeUpdates(
                        configUpdatePrivateKey,
                        configUpdatePublicKey
                    )

                    if (privKey || privateKey) {
                        const pubkeyhash = (
                            await hashKey(pubKey, {
                                keyAlgorithm: 'rsa-sha512',
                                deriveAlgorithm: hashAlgorithmsWorking[0],
                            })
                        ).serialized
                        configUpdate.certificates = {
                            [pubkeyhash]: privKey
                                ? {
                                      data: await serializeToBase64(privKey),
                                      note: '',
                                      // FIXME: detect algorithm from key
                                      algorithm: 'rsa-sha512',
                                  }
                                : null,
                        }
                        if (initialValues.signWith != values.signWith) {
                            configUpdate.signWith = {
                                [config.slots[0]]:
                                    privKey && values.signWith
                                        ? [
                                              ...(config.signWith[
                                                  config.slots[0]
                                              ] || []),
                                              pubkeyhash,
                                          ]
                                        : (
                                              config.signWith[
                                                  config.slots[0]
                                              ] || []
                                          ).filter((val) => val != pubkeyhash),
                            }
                        }
                    }
                    const configNew = await updateConfigRemoteReducer(config, {
                        update: configUpdate,
                        client: baseClient,
                        nullonnoupdate: true,
                    })
                    if (configNew) {
                        updateConfig(configNew, true)
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
                    updateMainCtx({
                        cloneData: values,
                        editCluster: values.cluster,
                    })
                }, [values])
                return (
                    <UpdateKeysForm
                        hashAlgorithmsRaw={hashAlgorithmsRaw}
                        hashAlgorithmsWorking={hashAlgorithmsWorking}
                        url={url}
                        generateButton={!publicKey}
                        canSelectCluster={canSelectCluster}
                        viewOnly={viewOnly}
                        disabled={disabled}
                    />
                )
            }}
        </Formik>
    )
}

function EditKeys({ viewOnly }: { viewOnly?: boolean }) {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [data, setData] = React.useState<
        [UnpackPromise<ReturnType<typeof loadKeys>>, string] | null
    >(null)

    let {
        refetch,
        data: dataUnfinished,
        loading,
        client,
    } = useQuery(keysRetrievalQuery, {
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
    }, [mainCtx.updateId])

    React.useEffect(() => {
        if (
            dataUnfinished &&
            dataUnfinished.secretgraph.node.cluster.id != mainCtx.editCluster
        ) {
            loading = true
            refetch()
        }
    }, [mainCtx.editCluster])

    React.useEffect(() => {
        let active = true
        if (!dataUnfinished || loading) {
            return
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
                readonly:
                    dataUnfinished.secretgraph.node.tags.includes('immutable'),
            }
            for (const tag of dataUnfinished.secretgraph.node.tags) {
                if (tag.startsWith('key_hash=')) {
                    updateOb['title'] = tag.match(/=(.*)/)[1]
                    break
                }
            }
            for (const tag of dataUnfinished.secretgraph.node.tags) {
                if (tag.startsWith('name=')) {
                    updateOb['title'] = tag.match(/=(.*)/)[1]
                    break
                }
            }
            let reskeys
            try {
                reskeys = await loadKeys({
                    baseUrl: mainCtx.url as string,
                    data: dataUnfinished,
                    config,
                    authorization: mainCtx.tokens,
                    client,
                })
            } catch (exc) {
                if (!active) {
                    return
                }
                throw exc
            }
            if (active) {
                updateMainCtx(updateOb)
                setData([reskeys, `${new Date().getTime()}`])
            }
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished, loading, config])
    if (!data) {
        return null
    }

    return (
        <KeysUpdate
            {...data[0]}
            key={data[1]}
            url={mainCtx.url as string}
            disabled={loading || viewOnly}
            viewOnly={viewOnly}
            canSelectCluster={
                mainCtx.tokensPermissions.has('manage') ||
                mainCtx.tokensPermissions.has('delete')
            }
        />
    )
}

function ViewKeys() {
    return <EditKeys viewOnly />
}

function CreateKeys() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { tokens } = React.useMemo(() => {
        if (mainCtx.editCluster) {
            return authInfoFromConfig({
                config,
                url: activeUrl,
                clusters: new Set([mainCtx.editCluster]),
                require: new Set(['create', 'manage']),
            })
        }
        return { tokens: [] }
    }, [config, mainCtx.editCluster, activeUrl])

    const authorization = React.useMemo(() => {
        return [...new Set([...mainCtx.tokens, ...tokens])]
    }, [tokens, mainCtx.tokens])

    const { data, loading, refetch } = useQuery(getContentConfigurationQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.editCluster || Constants.stubCluster,
            authorization,
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (data) {
            refetch({
                id: mainCtx.editCluster || Constants.stubCluster,
            })
        }
    }, [mainCtx.editCluster])
    const algosAndKey = React.useMemo(() => {
        const hashAlgorithmsRaw =
            data?.secretgraph?.config?.hashAlgorithms || []
        return {
            key: `${new Date().getTime()}`,
            hashAlgorithmsRaw,
            hashAlgorithmsWorking: findWorkingAlgorithms(
                hashAlgorithmsRaw,
                'hash'
            ),
        }
    }, [data?.secretgraph?.config?.hashAlgorithms])
    return (
        <KeysUpdate
            url={activeUrl}
            canSelectCluster
            disabled={loading}
            {...algosAndKey}
        />
    )
}

async function findOrReturn({
    client,
    authorization,
    id,
    url,
}: {
    client: ApolloClient<any>
    id: string | null
    url: string | null
    authorization: string[]
}): Promise<{ content: string; cluster: string | null } | null | true> {
    if (!id || !url) {
        return true
    }
    const { data } = await client.query({
        query: findOriginsQuery,
        variables: {
            authorization,
            id,
            groups: ['public_key'],
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
        return {
            content: d.edges[0].node.target.id,
            cluster: d.edges[0].node.target.cluster?.id || null,
        }
    }
    return null
}

export default function KeyComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const client = useApolloClient()
    const [barrier, setBarrier] = React.useState<
        Promise<any> | undefined | true
    >(true)
    React.useEffect(() => {
        let active = true
        const f = async () => {
            const result = await findOrReturn({
                client,
                id:
                    mainCtx.action === 'create'
                        ? null
                        : (mainCtx.item as string | null),
                url: mainCtx.url,
                authorization: mainCtx.tokens,
            })
            if (active) {
                if (result === true) {
                    setBarrier(undefined)
                } else if (result) {
                    let authInfo = undefined
                    if (
                        result.cluster &&
                        result.cluster != mainCtx.editCluster
                    ) {
                        authInfo = authInfoFromConfig({
                            config,
                            url: mainCtx.url as string,
                            contents: new Set([result.content]),
                            clusters: new Set([result.cluster]),
                        })
                    }
                    updateMainCtx({
                        item: result.content,
                        editCluster: result.cluster || undefined,
                        currentCluster: result.cluster || undefined,
                        type: 'PublicKey',
                        tokens: authInfo?.tokens || undefined,
                        tokensPermissions: authInfo?.types || undefined,
                    })
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
            setBarrier(true)
        }
    }, [mainCtx.url, mainCtx.item])
    if (barrier) {
        //if (barrier === true) {
        return null
        /*} else {
            throw barrier
        }*/
    }
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            updateMainCtx={updateMainCtx}
            view={ViewKeys}
            edit={EditKeys}
            create={CreateKeys}
        />
    )
}
