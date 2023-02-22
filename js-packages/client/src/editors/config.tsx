import { useQuery } from '@apollo/client'
import SecurityIcon from '@mui/icons-material/Security'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
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
    updateConfig as updateConfigOb,
} from '@secretgraph/misc/utils/config'
import { deriveClientPW } from '@secretgraph/misc/utils/encryption'
import {
    findWorkingHashAlgorithms,
    hashTagsContentHash,
} from '@secretgraph/misc/utils/hashing'
import { compareArray } from '@secretgraph/misc/utils/misc'
import {
    decryptContentObject,
    exportConfigAsUrl,
    updateOrCreateContentWithConfig,
} from '@secretgraph/misc/utils/operations'
import { FastField, Field, FieldArray, Form, Formik } from 'formik'
import * as React from 'react'

import ActionsDialog from '../components/ActionsDialog'
import ConfigProtected from '../components/ConfigProtected'
import DecisionFrame from '../components/DecisionFrame'
import FormikCheckboxWithLabel from '../components/formik/FormikCheckboxWithLabel'
import FormikTextField from '../components/formik/FormikTextField'
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
        lockPW: '',
        removeLockPW: false,
        securityQuestion: thisConfig?.configSecurityQuestion
            ? [thisConfig!.configSecurityQuestion[0], '']
            : ['The answer to life, the universe, and everything', '42'],
    }

    return (
        <>
            <ConfigShareDialog
                open={mainCtx.openDialog == 'share'}
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
                    if (values.cluster != initialValues.cluster) {
                        update['configCluster'] = values.cluster
                    }

                    if (values.lockPW) {
                        const configUrl = new URL(
                            await exportConfigAsUrl({
                                client: itemClient,
                                config: thisConfig,
                                slot: thisConfig.slots[0],
                                pw: values.lockPW,
                                types: ['privatekey'],
                            })
                        )
                        const query = new URLSearchParams(
                            configUrl.searchParams
                        )
                        query.append('url', configUrl.href.split(/#|\?/, 1)[0])

                        query.append('action', 'login')

                        update['configLockQuery'] = query.toString()
                    } else if (values.removeLockPW) {
                        update['configLockQuery'] = ''
                    }
                    if (
                        values.securityQuestion[0] !=
                            initialValues.securityQuestion[0] ||
                        values.securityQuestion[1].length
                    ) {
                        update['configSecurityQuestion'] = [
                            values.securityQuestion[0],
                            values.securityQuestion[1]
                                ? await deriveClientPW({
                                      pw: values.securityQuestion[1],
                                      hashAlgorithm: 'sha512',
                                      iterations: 1000000,
                                  })
                                : thisConfig.configSecurityQuestion[1],
                        ]
                    }
                    const [mergedConfig, changes] = updateConfigOb(
                        thisConfig,
                        update
                    )

                    const res = changes
                        ? await updateOrCreateContentWithConfig({
                              actions: actionsNew,
                              config,
                              mapper,
                              cluster: values.cluster,
                              value: new Blob([JSON.stringify(mergedConfig)]),
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
                              // to disable groupkeys
                              groupKeys: {},
                          })
                        : null
                    if (res) {
                        // main config has been changed
                        if (
                            res.config ||
                            mergedConfig.slots[0] == config.slots[0]
                        ) {
                            const nTokens = authInfoFromConfig({
                                config: res.config || mergedConfig,
                                url,
                                clusters: values.cluster
                                    ? new Set([values.cluster])
                                    : undefined,
                                require: new Set(['update', 'manage']),
                            }).tokens
                            updateConfig(res.config || mergedConfig, true)
                            updateMainCtx({
                                item: res.node.id,
                                updateId: res.node.updateId,
                                url,
                                action: 'update',
                                tokens: [
                                    ...new Set([
                                        ...mainCtx.tokens,
                                        ...nTokens,
                                    ]),
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
                    React.useEffect(() => {
                        values.lockPW &&
                            values.removeLockPW &&
                            setFieldValue('removeLockPW', false)
                    }, [values.lockPW])
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
                                <Grid xs>
                                    <Typography>Config Url</Typography>
                                    <Typography>{url}</Typography>
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
                                <Grid container xs={12}>
                                    <Grid xs={12} md={6}>
                                        <Field
                                            component={SimpleSelect}
                                            name="slots"
                                            disabled={isSubmitting || disabled}
                                            label="Slots"
                                            options={config.slots}
                                            freeSolo
                                            multiple
                                            validate={(val: string) => {
                                                if (!val) {
                                                    return 'empty'
                                                }
                                                return null
                                            }}
                                        />
                                    </Grid>
                                    <Grid xs={12} md={6}>
                                        <Field
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
                                <Grid container xs={12}>
                                    <Stack
                                        spacing={1}
                                        direction="column"
                                        sx={{
                                            width: '100%',
                                            margin: (theme) =>
                                                theme.spacing(1),
                                        }}
                                    >
                                        <Typography variant="h5">
                                            Update Security Question
                                        </Typography>
                                        <Field
                                            name="securityQuestion[0]"
                                            component={FormikTextField}
                                            disabled={isSubmitting || disabled}
                                            fullWidth
                                            variant="outlined"
                                            label="Security Question"
                                        />
                                        <Field
                                            name="securityQuestion[1]"
                                            component={FormikTextField}
                                            disabled={isSubmitting || disabled}
                                            fullWidth
                                            variant="outlined"
                                            label="Security Question Answer"
                                            helperText="Leave empty to keep the answer"
                                        />
                                    </Stack>
                                </Grid>
                                <Grid container xs={12}>
                                    <Stack
                                        spacing={1}
                                        direction="column"
                                        sx={{
                                            width: '100%',
                                            margin: (theme) =>
                                                theme.spacing(1),
                                        }}
                                    >
                                        <Typography variant="h5">
                                            {thisConfig.configLockQuery &&
                                            !values.removeLockPW
                                                ? 'Update Lock password'
                                                : 'Set Lock Pw'}
                                        </Typography>
                                        <Field
                                            name="lockPW"
                                            component={FormikTextField}
                                            disabled={
                                                isSubmitting ||
                                                disabled ||
                                                !nodeData
                                            }
                                            fullWidth
                                            variant="outlined"
                                            label="Password used for locking secretgraph on inactivity"
                                            helperText="Leave empty to keep the pw"
                                        />
                                        <Field
                                            name="removeLockPW"
                                            type="checkbox"
                                            Label={{
                                                label: 'Remove Password Lock',
                                            }}
                                            sx={{
                                                display:
                                                    !!thisConfig.configLockQuery,
                                            }}
                                            disabled={
                                                disabled ||
                                                !config.configLockQuery
                                                    .length ||
                                                values.lockPW.length ||
                                                !nodeData
                                            }
                                            component={FormikCheckboxWithLabel}
                                        />
                                        {!nodeData && (
                                            <Typography
                                                variant="body1"
                                                color="warning"
                                            >
                                                Need to save config first
                                            </Typography>
                                        )}
                                    </Stack>
                                </Grid>
                                {viewOnly ? null : (
                                    <>
                                        <Grid xs={12}>
                                            {isSubmitting && (
                                                <LinearProgress />
                                            )}
                                        </Grid>
                                        <Grid xs={12}>
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                disabled={
                                                    isSubmitting || !dirty
                                                }
                                                onClick={submitForm}
                                            >
                                                Submit
                                            </Button>
                                        </Grid>
                                    </>
                                )}
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
        | Error
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
                readonly: false,
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
            let thisConfig
            try {
                thisConfig = JSON.parse(await new Blob([data]).text())
                if (!cleanConfig(thisConfig)[0]) {
                    throw Error('Invalid config')
                }
            } catch (error) {
                setData(error)
                return
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
    if (data instanceof Error) {
        throw data
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
