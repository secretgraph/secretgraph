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
import Grid from '@mui/material/Grid2'
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
import { mappersToArray } from '../../hooks'
import { utf8encoder } from '@secretgraph/misc/utils/encoding'
import { AddressEntryData } from './address'
import BiographyBlock, {
    BioEntryData,
    AchievementEntryData,
} from './biography'

export interface InnerProfileProps {
    disabled?: boolean
    mapper: UnpackPromise<ReturnType<typeof generateActionMapper>>
    hashAlgorithm: string
    nodeData?: any
    data?: {
        firstname: string
        middlename: string
        lastname: string
        nationality: string
        birthdate: string | Date
        addresses: AddressEntryData[]
        work: BioEntryData[]
        education: BioEntryData[]
        achievements: AchievementEntryData[]
        projects: AchievementEntryData[]
    }
    url: string
    viewOnly?: boolean
}
export function InnerProfile({
    url,
    nodeData,
    mapper,
    data,
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
    const actions = mappersToArray([mapper], { lockExisting: !!mainCtx.item })
    const birthdate = data?.birthdate || mainCtx.cloneData?.birthdate

    const initialValues = {
        actions,
        cluster: mainCtx.editCluster,
        firstname: data?.firstname || mainCtx.cloneData?.firstname || '',
        middlename: data?.middlename || mainCtx.cloneData?.middlename || '',
        lastname: data?.lastname || mainCtx.cloneData?.lastname || '',
        nationality: data?.nationality || mainCtx.cloneData?.nationality || '',
        birthdate: birthdate ? new Date(birthdate) : null,
        sensitive: nodeData ? nodeData.state == 'sensitive' : false,
    }
    return (
        <Formik
            initialValues={initialValues}
            onSubmit={async (
                { firstname, middlename, lastname, birthdate, ...values },
                { setSubmitting }
            ) => {
                if (!values.cluster) {
                    throw Error('Cluster not set')
                }
                // TODO:
                const value = utf8encoder.encode(
                    JSON.stringify({
                        firstname,
                        middlename,
                        lastname,
                        birthdate,
                    })
                )
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
                    tags: [],
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
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <FastField
                                    component={FormikTextField}
                                    name="firstname"
                                    fullWidth
                                    label="First Name"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <FastField
                                    component={FormikTextField}
                                    name="lastname"
                                    fullWidth
                                    label="Last Name"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid size={12}>
                                <FastField
                                    component={FormikTextField}
                                    name="middlename"
                                    fullWidth
                                    label="Middle Names"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, lg: 3 }}>
                                <FastField
                                    component={FormikTextField}
                                    name="nationality"
                                    fullWidth
                                    label="Nationality"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, lg: 3 }}>
                                <FastField
                                    component={FormikDatePicker}
                                    name="birthdate"
                                    fullWidth
                                    label="Birthdate"
                                    disabled={isSubmitting || disabled}
                                />
                            </Grid>
                            <Grid size={12}></Grid>
                            <Grid size={12}>
                                {isSubmitting && <LinearProgress />}
                            </Grid>
                            {!viewOnly && (
                                <Grid size={12}>
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
