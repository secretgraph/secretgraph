import { FetchResult, useQuery } from '@apollo/client'
import LocalPoliceIcon from '@mui/icons-material/LocalPolice'
import PublicIcon from '@mui/icons-material/Public'
import Security from '@mui/icons-material/Security'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import { getClusterQuery } from '@secretgraph/graphql-queries/cluster'
import { serverConfigQuery } from '@secretgraph/graphql-queries/server'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise, ValueType } from '@secretgraph/misc/typing'
import {
    generateActionMapper,
    transformActions,
} from '@secretgraph/misc/utils/action'
import { authInfoFromConfig, saveConfig } from '@secretgraph/misc/utils/config'
import {
    findWorkingHashAlgorithms,
    hashObject,
    serializeToBase64,
} from '@secretgraph/misc/utils/encryption'
import {
    createCluster,
    updateCluster,
    updateConfigRemoteReducer,
} from '@secretgraph/misc/utils/operations'
import { FastField, FieldArray, Form, Formik } from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import DecisionFrame from '../components/DecisionFrame'
import FormikCheckboxWithLabel from '../components/formik/FormikCheckboxWithLabel'
import FormikTextField from '../components/formik/FormikTextField'
import SimpleShareDialog from '../components/share/SimpleShareDialog'
import * as Contexts from '../contexts'
import { mapperToArray } from '../hooks'

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
    const known = node && url && config.hosts[url]?.clusters[node.id]?.hashes
    const mapper = await generateActionMapper({
        config,
        unknownTokens: tokens,
        knownHashesCluster: known
            ? [known, node.availableActions]
            : node?.availableActions,
        hashAlgorithms,
    })
    return {
        mapper,
        name: node.name || '',
        description: node.description || '',
        public: node.public,
        featured: node.featured,
        url,
        hashAlgorithm: hashAlgorithms[0],
    }
}

interface ClusterInternProps {
    readonly name: string
    readonly description: string
    readonly featured?: boolean
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

    const [open, setOpen] = React.useState(false)
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { updateSearchCtx } = React.useContext(Contexts.Search)
    React.useLayoutEffect(() => {
        updateMainCtx({ title: props.name || '' })
    }, [props.name])

    const actions = mapperToArray(mapper, {
        lockExisting: !!mainCtx.item,
        readonlyCluster: false,
    })
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
        <>
            <Formik
                initialValues={{
                    actions,
                    name: props.name || '',
                    description: props.description || '',
                    featured: !!props.featured,
                }}
                onSubmit={async (
                    { actions: actionsNew, name, description, ...values },
                    { setSubmitting, resetForm }
                ) => {
                    let clusterResponse: FetchResult<any>
                    const {
                        hashes,
                        actions: finishedActions,
                        configUpdate,
                    } = await transformActions({
                        actions: actionsNew,
                        mapper,
                        hashAlgorithm,
                        ignoreCluster: false,
                    })
                    let digestCert: undefined | string = undefined,
                        privPromise: undefined | Promise<string> = undefined
                    if (mainCtx.item) {
                        clusterResponse = await updateCluster({
                            id: mainCtx.item as string,
                            client: itemClient,
                            updateId: mainCtx.updateId as string,
                            actions: finishedActions,
                            name,
                            description,
                            authorization: mainCtx.tokens,
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
                            name,
                            description,
                            hashAlgorithm,
                            publicKey,
                            privateKey,
                            privateKeyKey: key,
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
                        )[url].clusters[newNode.id as string].hashes[
                            digestCert
                        ] = []
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
                        ? authInfoFromConfig({
                              config: newConfig,
                              url,
                              clusters: new Set([
                                  clusterResponse.data.updateOrCreateCluster
                                      .cluster.id,
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
                        item: clusterResponse.data.updateOrCreateCluster.cluster
                            .id,
                        url,
                        updateId:
                            clusterResponse.data.updateOrCreateCluster.cluster
                                .updateId,
                        tokens: [...mainCtx.tokens, ...nTokens],
                    })
                    updateSearchCtx({
                        cluster:
                            clusterResponse.data.updateOrCreateCluster.cluster
                                .id,
                    })
                }}
            >
                {({ submitForm, isSubmitting, values, dirty }) => {
                    const loading = !!(isSubmitting || loadingIntern)
                    return (
                        <Form>
                            {mainCtx.item && (
                                <SimpleShareDialog
                                    actions={actions}
                                    shareUrl={
                                        new URL(url, window.location.href).href
                                    }
                                    isPublic={values.name.startsWith('@')}
                                    disabled={isSubmitting}
                                />
                            )}

                            <FieldArray name="actions">
                                {({ remove, replace, push, form }) => {
                                    return (
                                        <ActionsDialog
                                            remove={remove}
                                            replace={replace}
                                            push={push}
                                            form={form}
                                            disabled={isSubmitting}
                                            handleClose={() => setOpen(false)}
                                            open={open}
                                            isContent={false}
                                            isPublic={values.name.startsWith(
                                                '@'
                                            )}
                                        />
                                    )
                                }}
                            </FieldArray>
                            <Grid container spacing={2}>
                                <Grid item xs="auto">
                                    <Tooltip
                                        title={
                                            values.name.startsWith('@')
                                                ? 'public global'
                                                : 'internal'
                                        }
                                    >
                                        {values.name.startsWith('@') ? (
                                            <PublicIcon />
                                        ) : (
                                            <LocalPoliceIcon />
                                        )}
                                    </Tooltip>
                                </Grid>
                                <Grid item xs>
                                    <FastField
                                        component={FormikTextField}
                                        name="name"
                                        type="text"
                                        label="Name"
                                        helperText="Prefix with @ to register a global name"
                                        fullWidth
                                        disabled={disabled || loading}
                                    />
                                </Grid>

                                <Grid item xs="auto">
                                    <Tooltip title="Actions">
                                        <span>
                                            <IconButton
                                                edge="start"
                                                onClick={() => setOpen(!open)}
                                                size="large"
                                            >
                                                <Security />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Grid>

                                <Grid item xs={12}>
                                    <FastField
                                        component={FormikTextField}
                                        name="description"
                                        type="text"
                                        label="Description"
                                        fullWidth
                                        multiline
                                        disabled={disabled || loading}
                                    />
                                </Grid>

                                <Grid item xs={12}>
                                    <FastField
                                        component={FormikCheckboxWithLabel}
                                        name="featured"
                                        type="checkbox"
                                        Label={{ label: 'Featured' }}
                                        disabled={disabled || loading}
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    {loading && <LinearProgress />}
                                </Grid>
                                {viewOnly ? null : (
                                    <Grid item xs={12}>
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            disabled={
                                                loading || disabled || !dirty
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
        </>
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
                    console.debug(
                        dataUnfinished.secretgraph.node,
                        mainCtx.tokens
                    )
                    refetch()
                }
                return
            }

            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )

            const updateOb = {
                deleted: dataUnfinished.secretgraph.node.deleted || null,
                updateId: dataUnfinished.secretgraph.node.updateId,
                cluster: dataUnfinished.secretgraph.node.id,
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
                hashAlgorithms,
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

const CreateCluster = () => {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const [data, setData] = React.useState<
        (Omit<ClusterInternProps, 'disabled' | 'url'> & { key: string }) | null
    >(null)

    let { data: dataUnfinished, loading } = useQuery(serverConfigQuery, {
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
                deleted: false,
                updateId: null,
            })
            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )

            const hashKey = await hashObject(key, hashAlgorithms[0])
            if (active) {
                setData({
                    name: '',
                    description: '',
                    featured: false,
                    mapper: {
                        [hashKey]: {
                            type: 'action',
                            data: keyb64,
                            note: '',
                            newHash: hashKey,
                            oldHash: null,
                            actions: new Set(['manage,true']),
                            system: false,
                            hasUpdate: true,
                        },
                    },
                    hashAlgorithm: hashAlgorithms[0],
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
            create={CreateCluster}
            view={ViewCluster}
            edit={EditCluster}
        />
    )
}
