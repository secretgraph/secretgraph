import { ApolloClient, useApolloClient, useQuery } from '@apollo/client'
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
    contentFeedQuery,
    contentRetrievalQuery,
    findOriginsQuery,
    getContentConfigurationQuery,
    getContentRelatedQuery,
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
import DecisionFrame from '@secretgraph/ui-components/DecisionFrame'
import FormikDatePicker from '@secretgraph/ui-components/formik/FormikDatePicker'
import FormikTextField from '@secretgraph/ui-components/formik/FormikTextField'
import FormikTimePicker from '@secretgraph/ui-components/formik/FormikTimePicker'
import StateSelect from '@secretgraph/ui-components/forms/StateSelect'
import UploadButton from '@secretgraph/ui-components/UploadButton'
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

import ActionsDialog from '../../components/ActionsDialog'
import ClusterSelectViaUrl from '../../components/formsWithContext/ClusterSelectViaUrl'
import * as Contexts from '../../contexts'
import { mapperToArray } from '../../hooks'

export interface InnerProfileProps {
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    nodeData?: any
    data?: {
        note: string
    }
    tags?: { [name: string]: string[] }
    url: string
    viewOnly?: boolean
}
export function InnerProfile({
    url,
    nodeData,
    mapper,
    data,
    tags,
    disabled,
    hashAlgorithm,
    viewOnly,
}: InnerProfileProps) {
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
                    type: 'Profile',
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
                                    name="name"
                                    fullWidth
                                    label="Identifying Name"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid xs={12} sm={6}>
                                <FastField
                                    component={FormikTextField}
                                    name="firstname"
                                    fullWidth
                                    label="First Name"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid xs={12} sm={6}>
                                <FastField
                                    component={FormikTextField}
                                    name="middlename"
                                    fullWidth
                                    label="Middle Names"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid xs={12} sm={6}>
                                <FastField
                                    component={FormikTextField}
                                    name="lastname"
                                    fullWidth
                                    label="Last Name"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid xs={12} sm={2}>
                                <FastField
                                    component={FormikTextField}
                                    name="nationality"
                                    fullWidth
                                    label="Nationality"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid xs={12} sm={2}>
                                <FastField
                                    component={FormikDatePicker}
                                    name="birthdate"
                                    fullWidth
                                    label="Birthdate"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid xs={12}></Grid>
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
