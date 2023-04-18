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
import Grid from '@mui/material/Unstable_Grid2'
import Box from '@mui/system/Box'
import {
    contentRetrievalQuery,
    getContentConfigurationQuery,
} from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { UnpackPromise } from '@secretgraph/misc/typing'
import { generateActionMapper } from '@secretgraph/misc/utils/action'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import { findWorkingHashAlgorithms } from '@secretgraph/misc/utils/hashing'
import {
    decryptContentObject,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import {
    FastField,
    Field,
    FieldArray,
    FieldProps,
    Form,
    Formik,
    useField,
} from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import DecisionFrame from '../components/DecisionFrame'
import FormikTextField from '../components/formik/FormikTextField'
import FormikTimePicker from '../components/formik/FormikTimePicker'
import StateSelect from '../components/forms/StateSelect'
import ClusterSelectViaUrl from '../components/formsWithContext/ClusterSelectViaUrl'
import UploadButton from '../components/UploadButton'
import * as Contexts from '../contexts'
import { mapperToArray } from '../hooks'

type TimeEntryData = {
    start: string
    stop: string
    name: string
    distance: number
}

const TimeEntry = React.memo(function TimeEntry({
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
            <Grid xs={12} sm={6}>
                <Field
                    name={`times.${index}.start`}
                    component={FormikTimePicker}
                    maxTime={maxTime}
                    disabled={disabled}
                    clearable
                    label="Start"
                    format="hh:mm"
                    fullWidth
                />
            </Grid>
            <Grid xs={12} sm={6}>
                <Field
                    name={`times.${index}.stop`}
                    component={FormikTimePicker}
                    minTime={minTime}
                    clearable
                    showTodayButton
                    disabled={disabled}
                    label="Stop"
                    format="hh:mm"
                    fullWidth
                />
            </Grid>
            <Grid xs={12} sm={10}>
                <FastField
                    name={`times.${index}.name`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="Name"
                    fullWidth
                />
            </Grid>
            <Grid xs={12} sm={2}>
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
})

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
        push({
            start: '',
            stop: '',
            name: '',
            distance: 0,
        })
    }, [lastEntry.start, lastEntry.stop])
    return (
        <>
            {times.map((val, index) => (
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
    }
    tags?: { [name: string]: string[] }
    url: string
    viewOnly?: boolean
}
function InnerWorkday({
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
    const actions = mapperToArray(mapper, { lockExisting: !!mainCtx.item })

    const initialValues = {
        actions,
        cluster: mainCtx.editCluster,
        day:
            (tags ? tags['~day'][0] : null) ||
            new Date(Date.now()).toDateString(),
        work: (tags ? tags['~work'][0] : null) || '',
        note: data?.note || '',
        times: data?.times || [
            {
                start: '',
                stop: '',
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
                    }),
                ])
                const res = await updateOrCreateContentWithConfig({
                    actions: values.actions,
                    config,
                    mapper,
                    cluster: values.cluster,
                    value,
                    itemClient,
                    baseClient,
                    authorization: mainCtx.tokens,
                    state: values.sensitive ? 'sensitive' : 'protected',
                    type: 'Workday',
                    tags: [
                        `~name=Work: ${values.work}`,
                        `~work=${values.work}`,
                        `~day=${new Date(values.day).toDateString()}`,
                    ],
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
                        })
                    } else {
                        updateMainCtx({
                            item: res.node.id,
                            updateId: res.node.updateId,
                            url,
                            action: 'update',
                            editCluster: values.cluster,
                            currentCluster: values.cluster,
                        })
                    }
                } else {
                    setSubmitting(false)
                }
            }}
        >
            {({ values, isSubmitting, dirty, submitForm, setFieldValue }) => {
                React.useEffect(() => {
                    values.cluster &&
                        updateMainCtx({ editCluster: values.cluster })
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
                                <FastField
                                    component={FormikTextField}
                                    name="work"
                                    fullWidth
                                    label="Work"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid xs={12}>
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
                            <Grid xs>
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
                            <Grid xs={12}>
                                <Stack
                                    direction="column"
                                    spacing={1}
                                    divider={<Divider />}
                                >
                                    <FieldArray name="times">
                                        {({ push }) => (
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
                            <Grid xs={12}>
                                {isSubmitting && <LinearProgress />}
                            </Grid>
                            {!viewOnly && (
                                <Grid xs={12}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        disabled={
                                            disabled || isSubmitting || !dirty
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
}

const EditWorkday = ({ viewOnly }: { viewOnly?: boolean }) => {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<
        | (InnerWorkdayProps & {
              key: string
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
            dataUnfinished.secretgraph.node.cluster.id != mainCtx.editCluster
        ) {
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
            let obj
            try {
                obj = await decryptContentObject({
                    config,
                    nodeData: dataUnfinished.secretgraph.node,
                    blobOrTokens: mainCtx.tokens,
                    itemDomain: mainCtx.url || '/',
                })
            } catch (exc) {
                if (!active) {
                    return
                }
                throw exc
            }
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
                data: JSON.parse(await new Blob([obj.data]).text()),
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
    return <InnerWorkday {...data} disabled={loading} viewOnly={viewOnly} />
}
const CreateWorkday = () => {
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [data, setData] = React.useState<{
        key: string
        hashAlgorithm: string
        url: string
        mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    } | null>(null)
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
            const hashAlgorithms = findWorkingHashAlgorithms(
                dataUnfinished.secretgraph.config.hashAlgorithms
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
            setData({
                key: `${new Date().getTime()}`,
                hashAlgorithm: hashAlgorithms[0],
                url: activeUrl,
                mapper: mapper,
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
    return <InnerWorkday {...data} disabled={loading} />
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
