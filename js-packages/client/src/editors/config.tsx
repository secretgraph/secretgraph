import { useQuery } from '@apollo/client'
import SecurityIcon from '@mui/icons-material/Security'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
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
    cleanConfig,
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
import ConfigProtected from '../components/ConfigProtected'
import DecisionFrame from '../components/DecisionFrame'
import SimpleSelect from '../components/forms/SimpleSelect'
import ClusterSelectViaUrl from '../components/formsWithContext/ClusterSelectViaUrl'
import ConfigShareDialog from '../components/share/ConfigShareDialog'
import * as Contexts from '../contexts'
import { mapperToArray } from '../hooks'

interface InnerConfigProps {
    disabled?: boolean
    viewOnly?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    nodeData?: any
    tags?: { [name: string]: string[] }
    // TODO: make config optional and initialize new config or add stub in add
    config: Interfaces.ConfigInterface
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
        cluster: mainCtx.cluster || null,
    }

    return (
        <>
            <ConfigShareDialog
                open={mainCtx.openDialog == 'share'}
                disarmedQuestion
                closeFn={() => {
                    updateMainCtx({ openDialog: null })
                }}
            />
            <Formik
                initialValues={initialValues}
                onSubmit={async (
                    { actions: actionsNew, slots, ...values },
                    { setSubmitting }
                ) => {
                    if (!values.cluster) {
                        throw Error('Cluster not set')
                    }
                    const update: Interfaces.ConfigInputInterface = {}
                    if (!compareArray(initialValues.slots, slots)) {
                        update['slots'] = slots
                    }

                    const [mergedConfig, changes] = updateConfigOb(
                        thisConfig,
                        update
                    )
                    const res = await updateOrCreateContentWithConfig({
                        actions: actionsNew,
                        config,
                        mapper,
                        cluster: values.cluster,
                        value: changes
                            ? JSON.stringify(mergedConfig)
                            : undefined,
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
                                    ...new Set([...mainCtx.tokens, ...nTokens]),
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
                    touched,
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
                                <Grid xs={12}>
                                    {isSubmitting && <LinearProgress />}
                                </Grid>
                                <Grid xs={12}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        disabled={isSubmitting || !dirty}
                                        onClick={submitForm}
                                    >
                                        Submit
                                    </Button>
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
        | (Omit<
              Exclude<
                  UnpackPromise<ReturnType<typeof decryptContentObject>>,
                  null
              >,
              'data'
          > & {
              config: Interfaces.ConfigInterface
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
                shareFn: () => updateMainCtx({ openDialog: 'share' }),
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
                itemDomain: mainCtx.url || '/',
            })
            if (!obj) {
                console.error('failed decoding')
                return
            }
            const { data, ...obj2 } = obj
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
            updateMainCtx(updateOb)
            let thisConfig = JSON.parse(await new Blob([data]).text())
            if (!cleanConfig(thisConfig)[0]) {
                throw Error('Invalid config')
            }
            setData({
                ...obj2,
                config: thisConfig,
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
        <ConfigProtected>
            <DecisionFrame
                mainCtx={mainCtx}
                updateMainCtx={updateMainCtx}
                create={CreateConfig}
                view={ViewConfig}
                edit={EditConfig}
            />
        </ConfigProtected>
    )
}
