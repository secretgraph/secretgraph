import { FetchResult, useQuery } from '@apollo/client'
import LocalPoliceIcon from '@mui/icons-material/LocalPolice'
import PublicIcon from '@mui/icons-material/Public'
import Security from '@mui/icons-material/Security'
import { InputAdornment, Typography } from '@mui/material'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import Grid from '@mui/material/Unstable_Grid2'
import {
    clusterFeedQuery,
    getClusterQuery,
} from '@secretgraph/graphql-queries/cluster'
import { getNodeType } from '@secretgraph/graphql-queries/node'
import { serverConfigQueryWithPermissions } from '@secretgraph/graphql-queries/server'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise } from '@secretgraph/misc/typing'
import {
    generateActionMapper,
    transformActions,
} from '@secretgraph/misc/utils/action'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import { serializeToBase64 } from '@secretgraph/misc/utils/encoding'
import {
    findWorkingHashAlgorithms,
    hashKey,
    hashObject,
    hashToken,
} from '@secretgraph/misc/utils/hashing'
import {
    createCluster,
    updateCluster,
    updateConfigRemoteReducer,
} from '@secretgraph/misc/utils/operations'
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import FormikCheckboxWithLabel from '@secretgraph/ui-components/formik/FormikCheckboxWithLabel'
import SplittedGroupSelectList from '@secretgraph/ui-components/forms/SplittedGroupSelectList'
import GroupSelectList from '@secretgraph/ui-components/forms/GroupSelectList'
import FormikTextField from '@secretgraph/ui-components/formik/FormikTextField'
import { Field, FieldArray, FieldArrayRenderProps, Form, Formik } from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import SimpleShareDialog from '../components/share/SimpleShareDialog'
import * as Contexts from '../contexts'
import { mappersToArray } from '../hooks'

async function extractInfo({
    config,
    node,
    url,
    tokens,
    hashAlgorithms,
    permissions,
    serverConfig,
}: {
    config: Interfaces.ConfigInterface
    node?: any
    url: string
    tokens: string[]
    hashAlgorithms: string[]
    permissions: string[]
    serverConfig: {
        netGroups: {
            name: string
            description: string
            userSelectable: keyof typeof Constants.UserSelectable
            hidden: boolean
            properties: string[]
        }[]
        clusterGroups: {
            name: string
            description: string
            userSelectable: keyof typeof Constants.UserSelectable
            hidden: boolean
            properties: string[]
            injectedKeys: {
                link: string
                hash: string
            }[]
        }[]
    }
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
        primary: node.primary,
        clusterGroups: node.groups,
        netGroups: node.net ? node.net.groups : false,
        url,
        hashAlgorithm: hashAlgorithms[0],
        permissions,
        serverConfig,
    }
}

interface ClusterInternProps {
    name: string
    description: string
    featured: boolean
    primary: boolean
    clusterGroups: string[]
    netGroups: string[] | false
    url: string
    loading?: boolean
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    viewOnly?: boolean
    permissions: string[]
    serverConfig: {
        netGroups: {
            name: string
            description: string
            userSelectable: keyof typeof Constants.UserSelectable
            hidden: boolean
            properties: string[]
        }[]
        clusterGroups: {
            name: string
            description: string
            userSelectable: keyof typeof Constants.UserSelectable
            hidden: boolean
            properties: string[]
            injectedKeys: {
                link: string
                hash: string
            }[]
        }[]
    }
}

const ClusterIntern = ({
    mapper,
    disabled,
    hashAlgorithm,
    loading: loadingIntern,
    url,
    viewOnly,
    permissions,
    ...props
}: ClusterInternProps) => {
    disabled = disabled || viewOnly

    const [dirty, setDirty] = React.useState(false)
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    React.useLayoutEffect(() => {
        updateMainCtx({ title: props.name || '' })
    }, [props.name])

    const actions = mappersToArray([mapper], {
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
            {mainCtx.item && (
                <SimpleShareDialog
                    actions={actions}
                    shareUrl={new URL(url, window.location.href).href}
                    isPublic={props.name.startsWith('@')}
                    disabled={dirty}
                    hashAlgorithm={hashAlgorithm}
                />
            )}

            <Formik
                initialValues={{
                    actions,
                    name: props.name,
                    description: props.description,
                    featured: !!props.featured,
                    primary: !!props.primary,
                    clusterGroups: props.clusterGroups,
                    netGroups:
                        props.netGroups === false ? [] : props.netGroups,
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
                        config,
                        hashAlgorithm,
                        ignoreCluster: false,
                    })
                    let digestCert: undefined | string = undefined,
                        privPromise: undefined | Promise<string> = undefined
                    let tokens = mainCtx.tokens
                    /** activate with proper warning, should only be done with config baseUrl updates
                     * if (values.primary) {
                        tokens = authInfoFromConfig({
                            config,
                            url,
                            require: new Set(['manage']),
                        }).tokens
                    }*/
                    if (mainCtx.item) {
                        clusterResponse = await updateCluster({
                            id: mainCtx.item as string,
                            client: itemClient,
                            updateId: mainCtx.updateId as string,
                            actions: finishedActions,
                            name,
                            description,
                            authorization: tokens,
                            featured: values.featured,
                            primary: values.primary,
                            clusterGroups: values.clusterGroups,
                            netGroups: values.netGroups,
                        })
                        await itemClient.refetchQueries({
                            include: [clusterFeedQuery, getClusterQuery],
                        })
                    } else {
                        const { publicKey, privateKey } =
                            (await crypto.subtle.generateKey(
                                {
                                    name: 'RSA-OAEP',
                                    modulusLength: 4096,
                                    publicExponent: new Uint8Array([1, 0, 1]),
                                    hash: Constants.mapHashNames[hashAlgorithm]
                                        .operationName,
                                },
                                true,
                                ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
                            )) as Required<CryptoKeyPair>
                        privPromise = serializeToBase64(privateKey)
                        digestCert = (await hashKey(publicKey, hashAlgorithm))
                            .hash
                        clusterResponse = await createCluster({
                            client: itemClient,
                            actions: finishedActions,
                            name,
                            description,
                            hashAlgorithm,
                            keys: [
                                {
                                    publicKey,
                                    privateKey,
                                    publicState: 'trusted',
                                },
                            ],
                            authorization: tokens,
                            featured: values.featured,
                            primary: values.primary,
                            clusterGroups: values.clusterGroups,
                            netGroups:
                                props.netGroups === false
                                    ? undefined
                                    : values.netGroups,
                        })
                        await itemClient.refetchQueries({
                            include: [clusterFeedQuery],
                        })
                    }
                    if (clusterResponse.errors || !clusterResponse.data) {
                        console.error('failed', clusterResponse.errors)
                        setSubmitting(false)
                        return
                    }
                    // should be solved better
                    const newNode =
                        clusterResponse.data.secretgraph.updateOrCreateCluster
                            .cluster
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
                            note: `certificate of ${newNode.id}`,
                        }
                        configUpdate.signWith = {
                            [config.slots[0]]: [
                                ...(config.signWith[config.slots[0]] || []),
                                digestCert,
                            ],
                        }
                    }
                    let newConfig

                    try {
                        newConfig = await updateConfigRemoteReducer(config, {
                            update: configUpdate,
                            client: baseClient,
                            nullonnoupdate: true,
                        })
                    } catch (error) {
                        console.error('failed updating config', error)
                        setSubmitting(false)
                        return
                    }
                    const nTokens = newConfig
                        ? authInfoFromConfig({
                              config: newConfig,
                              url,
                              clusters: new Set([
                                  clusterResponse.data.secretgraph
                                      .updateOrCreateCluster.cluster.id,
                              ]),
                              require: new Set(['update', 'manage']),
                          }).tokens
                        : []
                    if (newConfig) {
                        updateConfig(newConfig, true)
                    }
                    updateMainCtx({
                        title: name || '',
                        action: 'update',
                        item: clusterResponse.data.secretgraph
                            .updateOrCreateCluster.cluster.id,
                        currentCluster:
                            clusterResponse.data.secretgraph
                                .updateOrCreateCluster.cluster.id,
                        editCluster:
                            clusterResponse.data.secretgraph
                                .updateOrCreateCluster.cluster.id,
                        url,
                        updateId:
                            clusterResponse.data.secretgraph
                                .updateOrCreateCluster.cluster.updateId,
                        tokens: [...mainCtx.tokens, ...nTokens],
                    })
                }}
            >
                {({ submitForm, isSubmitting, values, dirty }) => {
                    const loading = !!(isSubmitting || loadingIntern)
                    React.useEffect(() => {
                        updateMainCtx({ cloneData: values })
                    }, [values])
                    React.useEffect(() => {
                        setDirty(dirty)
                    }, [dirty])
                    return (
                        <Form>
                            <FieldArray name="actions">
                                {({
                                    remove,
                                    replace,
                                    push,
                                    form,
                                }: FieldArrayRenderProps) => {
                                    return (
                                        <ActionsDialog
                                            hashAlgorithm={hashAlgorithm}
                                            remove={remove}
                                            replace={replace}
                                            push={push}
                                            form={form}
                                            disabled={isSubmitting}
                                            handleClose={() =>
                                                updateMainCtx({
                                                    openDialog: null,
                                                })
                                            }
                                            open={
                                                mainCtx.openDialog == 'actions'
                                            }
                                            isContent={false}
                                            isPublic={values.name.startsWith(
                                                '@'
                                            )}
                                        />
                                    )
                                }}
                            </FieldArray>
                            <Grid container spacing={2}>
                                <Grid xs>
                                    <Field
                                        component={FormikTextField}
                                        InputProps={{
                                            startAdornment: (
                                                <Tooltip
                                                    title={
                                                        values.name.startsWith(
                                                            '@'
                                                        )
                                                            ? 'public global'
                                                            : 'protected'
                                                    }
                                                >
                                                    <InputAdornment
                                                        position="start"
                                                        disablePointerEvents
                                                    >
                                                        {values.name.startsWith(
                                                            '@'
                                                        ) ? (
                                                            <PublicIcon fontSize="medium" />
                                                        ) : (
                                                            <LocalPoliceIcon fontSize="medium" />
                                                        )}
                                                    </InputAdornment>
                                                </Tooltip>
                                            ),
                                        }}
                                        name="name"
                                        type="text"
                                        label="Name"
                                        helperText="Prefix with @ to register a global name"
                                        fullWidth
                                        disabled={disabled || loading}
                                        validate={async (val: string) => {
                                            if (
                                                !val.startsWith('@') ||
                                                val == props.name
                                            ) {
                                                return
                                            }
                                            if (
                                                !permissions.includes(
                                                    'allow_global_name'
                                                )
                                            ) {
                                                return 'no permission'
                                            }
                                            const { data } =
                                                await itemClient.query({
                                                    query: getNodeType,
                                                    variables: {
                                                        id: Buffer.from(
                                                            `Cluster:${val}`
                                                        ).toString('base64'),
                                                    },
                                                })
                                            if (data?.secretgraph?.node) {
                                                return 'Already registered'
                                            }
                                        }}
                                    />
                                </Grid>

                                <Grid xs="auto">
                                    <Tooltip title="Actions">
                                        <span>
                                            <IconButton
                                                edge="start"
                                                onClick={() =>
                                                    updateMainCtx({
                                                        openDialog: 'actions',
                                                    })
                                                }
                                                size="large"
                                            >
                                                <Security />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Grid>

                                <Grid xs={12}>
                                    <Field
                                        component={FormikTextField}
                                        name="description"
                                        type="text"
                                        label="Description"
                                        fullWidth
                                        multiline
                                        disabled={disabled || loading}
                                    />
                                </Grid>

                                <Grid xs={12}>
                                    <Field
                                        component={FormikCheckboxWithLabel}
                                        name="featured"
                                        type="checkbox"
                                        Label={{ label: 'Featured' }}
                                        disabled={
                                            disabled ||
                                            loading ||
                                            !permissions.includes(
                                                'allow_featured'
                                            )
                                        }
                                    />
                                    <Field
                                        component={FormikCheckboxWithLabel}
                                        name="primary"
                                        type="checkbox"
                                        Label={{
                                            label: 'Primary (can be used for admin stuff)',
                                        }}
                                        disabled
                                    />
                                </Grid>
                                <Grid xs={12}>
                                    <Typography>Cluster Groups</Typography>
                                    <SplittedGroupSelectList
                                        name="clusterGroups"
                                        initial={!mainCtx.item}
                                        groups={
                                            props.serverConfig.clusterGroups
                                        }
                                        disabled={disabled || loading}
                                    />
                                </Grid>
                                <Grid xs={12}>
                                    <Typography>Net Groups</Typography>
                                    <GroupSelectList
                                        name="netGroups"
                                        initial={!mainCtx.item}
                                        groups={props.serverConfig.netGroups}
                                        disabled={
                                            !values.primary ||
                                            props.netGroups === false ||
                                            disabled ||
                                            loading
                                        }
                                    />
                                </Grid>

                                <Grid xs={12}>
                                    {loading && <LinearProgress />}
                                </Grid>
                                {viewOnly ? null : (
                                    <Grid xs={12}>
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            disabled={loading || disabled}
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
        | (UnpackPromise<ReturnType<typeof extractInfo>> & {
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
                        'not found',
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
                readonly: false,
                shareFn: () => updateMainCtx({ openDialog: 'share' }),
            }
            if (
                dataUnfinished.secretgraph.node.id == config.configCluster &&
                mainCtx.url == config.baseUrl &&
                !updateOb.deleted
            ) {
                updateOb.deleted = false
            }
            const permissions = new Set([
                ...dataUnfinished.secretgraph.permissions,
            ])
            const clusterGroups = new Set<string>(
                dataUnfinished.secretgraph.node.groups
            )
            for (const group of dataUnfinished.secretgraph.config
                .clusterGroups) {
                if (clusterGroups.has(group.name)) {
                    for (const property of group.properties) {
                        permissions.add(property)
                    }
                }
            }
            const newData = await extractInfo({
                config,
                node: dataUnfinished.secretgraph.node,
                url: mainCtx.url as string,
                tokens: mainCtx.tokens,
                hashAlgorithms,
                permissions: [...permissions],
                serverConfig: dataUnfinished.secretgraph.config,
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

    let { data: dataUnfinished, loading } = useQuery(
        serverConfigQueryWithPermissions,
        {
            onError: console.error,
            variables: {
                authorization: mainCtx.tokens,
            },
        }
    )
    const { key: manage_key, keyb64: manage_keyb64 } = React.useMemo(() => {
        const key = crypto.getRandomValues(new Uint8Array(50))
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

            const hashKey = await hashToken(manage_key, hashAlgorithms[0])
            if (active) {
                const data: Omit<ClusterInternProps, 'disabled' | 'url'> & {
                    key: string
                } = {
                    name: '',
                    description: '',
                    featured: false,
                    primary: false,
                    netGroups: [],
                    clusterGroups:
                        dataUnfinished.secretgraph.config.clusterGroups
                            .filter(
                                (v: { name: string; properties: string[] }) =>
                                    v.properties.includes('default')
                            )
                            .map((val: { name: string }) => val.name),
                    permissions: dataUnfinished.secretgraph.permissions,
                    serverConfig: dataUnfinished.secretgraph.config,
                    mapper: {
                        [hashKey]: {
                            type: 'action',
                            data: manage_keyb64,
                            note: '',
                            newHash: hashKey,
                            oldHash: null,
                            actions: new Set(['manage,true']),
                            system: false,
                            hasUpdate: true,
                            validFor: [],
                        },
                    },
                    hashAlgorithm: hashAlgorithms[0],
                    key: `${new Date().getTime()}`,
                }
                if (mainCtx.cloneData) {
                    data.name = mainCtx.cloneData.name
                    data.description = mainCtx.cloneData.description
                    data.featured = mainCtx.cloneData.featured
                }
                setData(data)
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
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    // not capable yet
    // updateMainCtx={updateMainCtx}
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            create={CreateCluster}
            view={ViewCluster}
            edit={EditCluster}
        />
    )
}
