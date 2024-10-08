import { useQuery } from '@apollo/client'
import FlagIcon from '@mui/icons-material/Flag'
import LockIcon from '@mui/icons-material/Lock'
import MoreIcon from '@mui/icons-material/More'
import SecurityIcon from '@mui/icons-material/Security'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid2'
import Box from '@mui/system/Box'
import {
    contentFeedQuery,
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise } from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import { findWorkingAlgorithms } from '@secretgraph/misc/utils/crypto'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import FormikTextField from '@secretgraph/ui-components/formik/FormikTextField'
import FormikTimePicker from '@secretgraph/ui-components/formik/FormikTimePicker'
import {
    FastField,
    Field,
    FieldArray,
    FieldArrayRenderProps,
    FieldProps,
    Form,
    Formik,
    useField,
} from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import ClusterSelectViaUrl from '../components/formsWithContext/ClusterSelectViaUrl'
import * as Contexts from '../contexts'
import { mappersToArray } from '../hooks'
import FormikDatePicker from '@secretgraph/ui-components/formik/FormikDatePicker'

type TimeEntryData = {
    start: string
    stop: string
    name: string
    distance: number
}

// no memo otherwise when indexes change the wrong result is returned
const TimeEntry = function TimeEntry({
    disabled,
    index,
}: {
    disabled: boolean
    index: number
}) {
    const { value: minTime } = useField(`times.${index}.start`)[0]
    const { value: maxTime } = useField(`times.${index}.stop`)[0]

    return (
        <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
                <FastField
                    name={`times.${index}.start`}
                    component={FormikTimePicker}
                    max={maxTime}
                    disabled={disabled}
                    label="Start"
                    format="hh:mm"
                    fullWidth
                />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
                <FastField
                    name={`times.${index}.stop`}
                    component={FormikTimePicker}
                    min={minTime}
                    disabled={disabled}
                    label="Stop"
                    format="hh:mm"
                    fullWidth
                />
            </Grid>
            <Grid size={{ xs: 12, sm: 10 }}>
                <FastField
                    name={`times.${index}.name`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="Name"
                    fullWidth
                />
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
                <FastField
                    name={`times.${index}.distance`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="Distance"
                    type="number"
                    inputProps={{
                        min: '0',
                    }}
                />
            </Grid>
        </Grid>
    )
}

const TimeEntries = React.memo(function TimeEntries({
    disabled,
    times,
    push,
}: {
    disabled: boolean
    times: TimeEntryData[]
    push: (inp: TimeEntryData) => void
}) {
    const lastEntry = times.length
        ? times[times.length - 1]
        : {
              start: 'invalid',
              stop: 'invalid',
          }
    React.useEffect(() => {
        if (!lastEntry.start || !lastEntry.stop) {
            return
        }
        // fixme: double call with old value, workaround with filter
        const newentry = {
            start: '',
            stop: '',
            name: '',
            distance: 0,
        }
        push(newentry)
    }, [lastEntry.start, lastEntry.stop])
    return (
        <>
            {times
                .filter(
                    (val, index) =>
                        val.start ||
                        val.stop ||
                        val.name ||
                        val.distance ||
                        index == times.length - 1
                )
                .map((val, index) => (
                    <TimeEntry index={index} disabled={disabled} key={index} />
                ))}
        </>
    )
})

interface InnerWorkdayProps {
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    nodeData?: any
    data?: {
        note: string
        times: TimeEntryData[]
        work: string
        day: Date
    }
    tags?: { [name: string]: string[] }
    url: string
    viewOnly?: boolean
}
const InnerWorkday = React.memo(function InnerWorkday({
    url,
    nodeData,
    mapper,
    data,
    tags,
    disabled,
    hashAlgorithm,
    viewOnly,
}: InnerWorkdayProps) {
    disabled = disabled || viewOnly

    const [open, setOpen] = React.useState(false)
    const { itemClient, baseClient } = React.useContext(Contexts.Clients)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config, updateConfig } = React.useContext(
        Contexts.InitializedConfig
    )
    const actions = mappersToArray([mapper], { lockExisting: !!mainCtx.item })

    const initialValues = {
        actions,
        cluster: mainCtx.editCluster,
        day: (data ? data.day : null) || new Date().toISOString(),
        work: data?.work || mainCtx.cloneData?.work || '',
        note: data?.note || mainCtx.cloneData?.note || '',
        times: data?.times || [
            {
                start: new Date().toISOString(),
                stop: new Date().toISOString(),
                name: '',
                distance: 0,
            },
        ],
        sensitive: nodeData ? nodeData.state == 'sensitive' : false,
    }
    return (
        <Formik
            initialValues={initialValues}
            onSubmit={async (values, { setSubmitting }) => {
                if (!values.cluster) {
                    throw Error('Cluster not set')
                }
                const value = new Blob([
                    JSON.stringify({
                        note: values.note,
                        times: values.times.slice(0, -1),
                        work: values.work,
                        day: new Date(values.day).toDateString(),
                    }),
                ])
                const res = await updateOrCreateContentWithConfig({
                    actions: values.actions,
                    config,
                    mapper,
                    cluster: values.cluster,
                    value: value.arrayBuffer(),
                    itemClient,
                    baseClient,
                    authorization: mainCtx.tokens,
                    state: values.sensitive ? 'sensitive' : 'protected',
                    type: 'Workday',
                    tags: [
                        `~name=Work: ${values.work}`,
                        `~work=${values.work}`,
                        `~day=${new Date(values.day).toDateString()}`,
                        `mime=application/json`,
                    ],
                    id: nodeData?.id,
                    updateId: nodeData?.updateId,
                    url,
                    hashAlgorithm,
                })
                await itemClient.refetchQueries({
                    include: [getContentConfigurationQuery, contentFeedQuery],
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
                        updateConfig(res.config, true)
                        updateMainCtx({
                            item: res.node.id,
                            updateId: res.node.updateId,
                            url,
                            action: 'update',
                            tokens: [
                                ...new Set([...mainCtx.tokens, ...nTokens]),
                            ],
                            editCluster: values.cluster,
                            currentCluster: values.cluster,
                            cloneData: null,
                        })
                    } else {
                        updateMainCtx({
                            item: res.node.id,
                            updateId: res.node.updateId,
                            url,
                            action: 'update',
                            editCluster: values.cluster,
                            currentCluster: values.cluster,
                            cloneData: null,
                        })
                    }
                } else {
                    setSubmitting(false)
                }
            }}
        >
            {({ values, isSubmitting, dirty, submitForm, setFieldValue }) => {
                React.useEffect(() => {
                    updateMainCtx({ cloneData: values })
                }, [values])
                React.useEffect(() => {
                    values.cluster &&
                        updateMainCtx({ editCluster: values.cluster })
                }, [values.cluster])
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
                                        remove={remove}
                                        replace={replace}
                                        push={push}
                                        form={form}
                                        disabled={isSubmitting || disabled}
                                        handleClose={() => setOpen(false)}
                                        open={open}
                                        isContent
                                        isPublic={false}
                                        hashAlgorithm={hashAlgorithm}
                                    />
                                )
                            }}
                        </FieldArray>
                        <Grid container spacing={2}>
                            <Grid size="grow" container spacing={2}>
                                <Grid size="grow">
                                    <FastField
                                        component={FormikTextField}
                                        name="work"
                                        fullWidth
                                        label="Work"
                                        disabled={isSubmitting || disabled}
                                    />
                                </Grid>
                                <Grid size="grow">
                                    <FastField
                                        component={FormikDatePicker}
                                        name="day"
                                        fullWidth
                                        label="Day"
                                        disabled={isSubmitting || disabled}
                                    />
                                </Grid>
                                <Grid size="grow">
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
                            <Grid size="auto">
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
                            <Grid size={12}>
                                <FastField
                                    component={FormikTextField}
                                    name="note"
                                    fullWidth
                                    multiline
                                    minRows={3}
                                    label="Note"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid size={12}>
                                <Stack
                                    direction="column"
                                    spacing={1}
                                    divider={<Divider />}
                                >
                                    <FieldArray name="times">
                                        {({ push }: FieldArrayRenderProps) => (
                                            <TimeEntries
                                                push={push}
                                                disabled={
                                                    !!disabled || isSubmitting
                                                }
                                                times={values.times}
                                            />
                                        )}
                                    </FieldArray>
                                </Stack>
                            </Grid>
                            <Grid size={12}>
                                {isSubmitting && <LinearProgress />}
                            </Grid>
                            {!viewOnly && (
                                <Grid size={12}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        disabled={
                                            disabled ||
                                            !values.work ||
                                            isSubmitting ||
                                            !dirty
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
    )
})

const EditWorkday = ({ viewOnly }: { viewOnly?: boolean }) => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<[InnerWorkdayProps, string] | null>(
        null
    )

    let {
        data: dataUnfinished,
        loading,
        refetch,
        client,
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
            dataUnfinished.secretgraph.node.cluster.id != mainCtx.editCluster
        ) {
            loading = true
            refetch()
        }
    }, [mainCtx.editCluster])
    React.useEffect(() => {
        if (!dataUnfinished || loading) {
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
                readonly:
                    dataUnfinished.secretgraph.node.tags.includes('immutable'),
            }
            const host = mainCtx.url ? config.hosts[mainCtx.url] : null
            const contentstuff =
                host && host.contents[dataUnfinished.secretgraph.node.id]

            const hashAlgorithms = findWorkingAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms,
                'hash'
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
            if (!active || loading) {
                return
            }
            let obj
            try {
                obj = await decryptContentObject({
                    config,
                    nodeData: dataUnfinished.secretgraph.node,
                    blobOrTokens: mainCtx.tokens,
                    itemDomain: mainCtx.url || '/',
                    transferClient: client,
                })
            } catch (exc) {
                if (!active || loading) {
                    return
                }
                throw exc
            }
            if (!obj) {
                console.error('failed decoding')
                return
            }
            if (!active || loading) {
                return
            }

            let name: string = mainCtx.item || ''
            if (obj.tags.name && obj.tags.name.length > 0) {
                name = obj.tags.name[0]
            } else if (obj.tags['~name'] && obj.tags['~name'].length > 0) {
                name = obj.tags['~name'][0]
            }
            updateOb['title'] = name
            setData([
                {
                    ...obj,
                    data: JSON.parse(await new Blob([obj.data]).text()),
                    hashAlgorithm: hashAlgorithms[0],
                    url: mainCtx.url as string,
                    mapper: await mapper,
                },
                `${new Date().getTime()}`,
            ])
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return (
        <InnerWorkday
            {...data[0]}
            key={data[1]}
            disabled={loading}
            viewOnly={viewOnly}
        />
    )
}
const CreateWorkday = () => {
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<
        | [
              {
                  hashAlgorithm: string
                  url: string
                  mapper: UnpackPromise<
                      ReturnType<typeof generateActionMapper>
                  >
              },
              string
          ]
        | null
    >(null)
    let {
        data: dataUnfinished,
        refetch,
        loading,
    } = useQuery(getContentConfigurationQuery, {
        fetchPolicy: 'cache-and-network',
        variables: {
            id: mainCtx.editCluster || Constants.stubCluster,
            authorization: mainCtx.tokens,
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (mainCtx.editCluster) {
            loading = true
            refetch()
        }
    }, [mainCtx.editCluster])

    React.useEffect(() => {
        if (!dataUnfinished) {
            return
        }
        let active = true
        const f = async () => {
            if (!dataUnfinished) {
                return
            }
            updateMainCtx({
                deleted: false,
                updateId: null,
            })

            const hashAlgorithms = findWorkingAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms,
                'hash'
            )

            const host = mainCtx.url ? config.hosts[mainCtx.url] : null

            const mapper = await generateActionMapper({
                config,
                knownHashesCluster: dataUnfinished.secretgraph.node
                    ? [
                          dataUnfinished.secretgraph.node.availableActions,
                          host?.clusters[dataUnfinished.secretgraph.node.id]
                              ?.hashes,
                      ]
                    : [],
                hashAlgorithms,
            })
            if (!active) {
                return
            }
            setData([
                {
                    hashAlgorithm: hashAlgorithms[0],
                    url: activeUrl,
                    mapper: mapper,
                },
                `${new Date().getTime()}`,
            ])
        }
        f()
        return () => {
            active = false
        }
    }, [dataUnfinished])
    if (!data) {
        return null
    }
    return <InnerWorkday {...data[0]} key={data[1]} disabled={loading} />
}
const ViewWorkday = () => {
    return <EditWorkday viewOnly />
}

export default function WorkdayComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            updateMainCtx={updateMainCtx}
            create={CreateWorkday}
            view={ViewWorkday}
            edit={EditWorkday}
        />
    )
}
