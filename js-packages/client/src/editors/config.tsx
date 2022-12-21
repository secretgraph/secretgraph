import { useQuery } from '@apollo/client'
import SecurityIcon from '@mui/icons-material/Security'
import IconButton from '@mui/material/IconButton'
import { Theme } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import { contentRetrievalQuery } from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise } from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import {
    authInfoFromConfig,
    saveConfig,
    updateConfig as updateConfigOb,
} from '@secretgraph/misc/utils/config'
import {
    findWorkingHashAlgorithms,
    hashTagsContentHash,
} from '@secretgraph/misc/utils/hashing'
import { compareArray } from '@secretgraph/misc/utils/misc'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import { FastField, FieldArray, Form, Formik } from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import DecisionFrame from '../components/DecisionFrame'
import SimpleSelect from '../components/forms/SimpleSelect'
import ClusterSelectViaUrl from '../components/formsWithContext/ClusterSelectViaUrl'
import * as Contexts from '../contexts'
import { mapperToArray } from '../hooks'

interface InnerConfigProps {
    disabled?: boolean
    viewOnly?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    nodeData?: any
    tags?: { [name: string]: string[] }
    config?: Interfaces.ConfigInterface
    url: string
}

function InnerConfig({
    disabled,
    nodeData,
    mapper,
    url,
    hashAlgorithm,
    config: thisConfig,
    viewOnly,
}: InnerConfigProps) {
    disabled = disabled || viewOnly
    const [open, setOpen] = React.useState(false)
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const actions = mapperToArray(mapper, { lockExisting: !!mainCtx.item })

    const initialValues = {
        slots: thisConfig?.slots || [],
        actions,
        cluster: mainCtx.cluster || '',
    }

    return (
        <>
            <Formik
                initialValues={initialValues}
                onSubmit={async (
                    { actions: actionsNew, slots, ...values },
                    { setSubmitting }
                ) => {
                    const retrieved = await decryptContentObject({
                        nodeData,
                        config,
                        blobOrTokens: mainCtx.tokens,
                        itemDomain: url,
                    })
                    if (!retrieved) {
                        throw Error(
                            'could not retrieve and decode config object'
                        )
                    }
                    const foundConfig = JSON.parse(
                        String.fromCharCode(...new Uint8Array(retrieved.data))
                    )
                    const update: Interfaces.ConfigInputInterface = {}
                    if (!compareArray(initialValues.slots, slots)) {
                        update['slots'] = slots
                    }

                    const [mergedConfig, changes] = updateConfigOb(
                        foundConfig,
                        update
                    )
                    const res = await updateOrCreateContentWithConfig({
                        actions: actionsNew,
                        config,
                        mapper,
                        cluster: values.cluster,
                        value: JSON.stringify(mergedConfig),
                        contentHash: !nodeData
                            ? await hashTagsContentHash(
                                  [`slot=${slots[0]}`],
                                  'Config',
                                  hashAlgorithm
                              )
                            : undefined,
                        tags: ['name=config.json', `slot=${slots[0]}`],
                        itemClient,
                        baseClient,
                        authorization: mainCtx.tokens,
                        state: 'protected',
                        type: 'Config',
                        id: nodeData?.id,
                        updateId: nodeData?.updateId,
                        url,
                        hashAlgorithm,
                    })
                    if (res) {
                        if (res.config) {
                            const nTokens = authInfoFromConfig({
                                config: res.config,
                                url,
                                clusters: values.cluster
                                    ? new Set([values.cluster])
                                    : undefined,
                                require: new Set(['update', 'manage']),
                            }).tokens
                            saveConfig(res.config)
                            updateConfig(res.config, true)
                            updateMainCtx({
                                item: res.node.id,
                                updateId: res.node.updateId,
                                url,
                                action: 'update',
                                tokens: [
                                    ...new Set(...mainCtx.tokens, ...nTokens),
                                ],
                            })
                        } else {
                            updateMainCtx({
                                item: res.node.id,
                                updateId: res.node.updateId,
                                url,
                                action: 'update',
                            })
                        }
                    } else {
                        setSubmitting(false)
                    }
                }}
            >
                {({
                    values,
                    isSubmitting,
                    dirty,
                    submitForm,
                    setFieldValue,
                }) => {
                    React.useEffect(() => {
                        values.cluster &&
                            updateMainCtx({ cluster: values.cluster })
                    }, [values.cluster])
                    return (
                        <Form>
                            <FieldArray name="actions">
                                {({ remove, replace, push, form }) => {
                                    return (
                                        <ActionsDialog
                                            remove={remove}
                                            replace={replace}
                                            push={push}
                                            form={form}
                                            disabled={isSubmitting || disabled}
                                            handleClose={() => setOpen(false)}
                                            open={open}
                                            isContent
                                            isPublic={false}
                                        />
                                    )
                                }}
                            </FieldArray>
                            <Grid container spacing={2}>
                                <Grid xs={12}>
                                    <Typography>Active Url</Typography>
                                    <Typography>{url}</Typography>
                                </Grid>
                                <Grid container xs>
                                    <Grid xs={12} md={6}>
                                        <FastField
                                            component={SimpleSelect}
                                            url={url}
                                            name="slots"
                                            disabled={isSubmitting || disabled}
                                            label="Slots"
                                            firstIfEmpty
                                            validate={(val: string) => {
                                                if (!val) {
                                                    return 'empty'
                                                }
                                                return null
                                            }}
                                        />
                                    </Grid>
                                    <Grid xs={12} md={6}>
                                        <FastField
                                            component={ClusterSelectViaUrl}
                                            url={url}
                                            name="cluster"
                                            disabled={isSubmitting || disabled}
                                            label="Cluster"
                                            firstIfEmpty
                                            validate={(val: string) => {
                                                if (!val) {
                                                    return 'empty'
                                                }
                                                return null
                                            }}
                                        />
                                    </Grid>
                                </Grid>
                                <Grid xs="auto">
                                    <Tooltip title="Actions">
                                        <span>
                                            <IconButton
                                                onClick={() => setOpen(!open)}
                                                size="large"
                                            >
                                                <SecurityIcon />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Grid>
                            </Grid>
                        </Form>
                    )
                }}
            </Formik>
        </>
    )
}

const EditConfig = ({ viewOnly }: { viewOnly?: boolean }) => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<
        | (Exclude<
              UnpackPromise<ReturnType<typeof decryptContentObject>>,
              null
          > & {
              text: string
              key: string
              hashAlgorithm: string
              url: string
              mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
          })
        | null
    >(null)

    let {
        data: dataUnfinished,
        loading,
        refetch,
    } = useQuery(contentRetrievalQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.item as string,
            authorization: mainCtx.tokens,
        },
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
            dataUnfinished.secretgraph.node.cluster.id != mainCtx.cluster
        ) {
            loading = true
            refetch()
        }
    }, [mainCtx.cluster])
    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        let active = true
        const f = async () => {
            const updateOb: Partial<Interfaces.MainContextInterface> = {
                //shareUrl: dataUnfinished.secretgraph.node.link,
                deleted: dataUnfinished.secretgraph.node.deleted || null,
                updateId: dataUnfinished.secretgraph.node.updateId,
                tokensPermissions: new Set([
                    ...mainCtx.tokensPermissions,
                    ...dataUnfinished.secretgraph.node.availableActions.map(
                        (val: { keyHash: string; type: string }) => val.type
                    ),
                ]),
            }
            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const contentstuff =
                host && host.contents[dataUnfinished.secretgraph.node.id]

            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
            )
            const mapper = await generateActionMapper({
                config,
                knownHashesCluster: [
                    dataUnfinished.secretgraph.node.cluster?.availableActions,
                    contentstuff &&
                        host?.clusters[contentstuff.cluster]?.hashes,
                ],
                knownHashesContent: [
                    dataUnfinished.secretgraph.node.availableActions,
                    contentstuff?.hashes,
                ],
                hashAlgorithms,
            })
            if (!active) {
                return
            }
            const obj = await decryptContentObject({
                config,
                nodeData: dataUnfinished.secretgraph.node,
                blobOrTokens: mainCtx.tokens,
            })
            if (!obj) {
                console.error('failed decoding')
                return
            }
            if (!active) {
                return
            }

            let name: string = mainCtx.item || ''
            if (obj.tags.name && obj.tags.name.length > 0) {
                name = obj.tags.name[0]
            } else if (obj.tags['~name'] && obj.tags['~name'].length > 0) {
                name = obj.tags['~name'][0]
            }
            updateOb['title'] = name
            setData({
                ...obj,
                text: await new Blob([obj.data]).text(),
                key: `${new Date().getTime()}`,
                hashAlgorithm: hashAlgorithms[0],
                url: mainCtx.url as string,
                mapper: await mapper,
            })
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return <InnerConfig {...data} disabled={loading} viewOnly={viewOnly} />
}
const ViewConfig = () => {
    return <EditConfig viewOnly />
}

const CreateConfig = () => {
    return <div />
}

export default function ConfigComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            updateMainCtx={updateMainCtx}
            create={CreateConfig}
            view={ViewConfig}
            edit={EditConfig}
        />
    )
}
