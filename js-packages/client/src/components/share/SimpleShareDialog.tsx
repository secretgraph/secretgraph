import DeleteIcon from '@mui/icons-material/Delete'
import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel, { TabPanelProps } from '@mui/lab/TabPanel'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import { Theme } from '@mui/material/styles'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow, { TableRowProps } from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import useMediaQuery from '@mui/material/useMediaQuery'
import { addActionsMutation } from '@secretgraph/graphql-queries/node'
import {
    ActionInputEntry,
    CertificateEntry,
    CertificateInputEntry,
    transformActions,
} from '@secretgraph/misc/utils/action'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import { hashToken } from '@secretgraph/misc/utils/hashing'
import * as SetOps from '@secretgraph/misc/utils/set'
import { FastField, FieldArray, Form, Formik } from 'formik'
import { QRCodeSVG } from 'qrcode.react'
import * as React from 'react'

import * as Contexts from '../../contexts'
import FormikCheckboxWithLabel from '../formik/FormikCheckboxWithLabel'
import TokenSelect from '../forms/TokenSelect'
import ActionOrCertificateConfigurator from '../formsWithContext/ActionOrCertificateConfigurator'
import { HashEntry } from '../misc'

const _update_set = new Set(['update', 'manage'])
function SharePanel({ url }: { url: string }) {
    const isMedium = useMediaQuery((theme: Theme) =>
        theme.breakpoints.up('md')
    )
    const isBig = useMediaQuery((theme: Theme) => theme.breakpoints.up('xl'))
    return (
        <details>
            <summary
                style={{
                    whiteSpace: 'nowrap',
                    paddingRight: '4px',
                }}
            >
                <span
                    style={{
                        display: 'inline-block',
                    }}
                >
                    <Link
                        href={url}
                        style={{
                            wordBreak: 'break-all',
                            display: 'block',
                            maxWidth: '100%',
                            whiteSpace: 'normal',
                        }}
                        onClick={(event: any) => {
                            if (navigator.clipboard) {
                                navigator.clipboard.writeText(url)
                                event.preventDefault()
                                console.log('url copied')
                                return false
                            } else {
                                console.log('clipboard not supported')
                            }
                        }}
                    >
                        {url}
                    </Link>
                </span>
            </summary>
            <Box sx={{ height: (theme) => theme.spacing(2) }} />
            <QRCodeSVG
                value={url}
                width="100%"
                height="100%"
                style={{
                    maxHeight: '70vh',
                }}
                level={isBig ? 'Q' : isMedium ? 'M' : 'L'}
            />
        </details>
    )
}

function NewPanel({
    shareUrl,
    disabled,
    isPublic,
    isContent,
    tokens,
    hashAlgorithm,
    ...props
}: Exclude<TabPanelProps, 'children'> & {
    shareUrl: string
    tokens: string[]
    isContent: boolean
    isPublic: boolean
    hashAlgorithm: string
    disabled?: boolean
}) {
    const { mainCtx } = React.useContext(Contexts.Main)
    const { itemClient } = React.useContext(Contexts.Clients)
    const [ntokens, setNTokens] = React.useState<string[]>([])
    const actions: ActionInputEntry[] = []
    if (isPublic) {
        actions.push({
            value: {
                action: 'update',
            },
            start: '' as const,
            stop: '' as const,
            data: '',
            note: '',
            type: 'action',
            newHash: '',
            locked: false,
        })
    } else {
        actions.push({
            value: {
                action: 'view',
            },
            start: '' as const,
            stop: '' as const,
            data: '',
            note: '',
            type: 'action',
            newHash: '',
            locked: false,
        })
    }
    const url = React.useMemo(() => {
        const parsedUrl = new URL(shareUrl)
        parsedUrl.searchParams.delete('token')
        for (const t of ntokens) {
            parsedUrl.searchParams.append('token', t)
        }
        return parsedUrl.href
    }, [mainCtx.item, shareUrl, ntokens])
    return (
        <TabPanel {...props}>
            <SharePanel url={url} />
            <Box sx={{ height: (theme) => theme.spacing(3) }} />
            <Formik
                initialValues={{
                    actions,
                    storeInConfig: true,
                }}
                onSubmit={async (values, { setSubmitting }) => {
                    if (!values.actions[0].data) {
                        setSubmitting(false)
                        return
                    }

                    const newHash = await hashToken(
                        values.actions[0].data,
                        hashAlgorithm
                    )
                    const { actions: finishedActions } =
                        await transformActions({
                            actions: values.actions,
                            hashAlgorithm,
                        })

                    await itemClient.mutate({
                        mutation: addActionsMutation,
                        variables: {
                            ids: [mainCtx.item],
                            authorize: tokens,
                            actions: finishedActions,
                        },
                    })
                    setNTokens([values.actions[0].data])
                    setSubmitting(false)
                }}
            >
                {({
                    values,
                    setFieldValue,
                    isSubmitting,
                    submitForm,
                    dirty,
                }) => {
                    return (
                        <Form>
                            <ActionOrCertificateConfigurator
                                hashAlgorithm={hashAlgorithm}
                                path="actions.0."
                                disabled={disabled}
                                isContent={isContent}
                                mode={isPublic ? 'publicShare' : 'share'}
                                tokens={tokens}
                                handleNoteChange={(e) =>
                                    setFieldValue('actions.0.note', e)
                                }
                                value={{
                                    type: 'action',
                                    start: '',
                                    stop: '',
                                    data: '',
                                    note: '',
                                    newHash: '',
                                    value: values.actions[0].value,
                                }}
                            />
                            <FastField
                                name="storeInConfig"
                                component={FormikCheckboxWithLabel}
                                Label={{ label: 'Store in Config' }}
                            />
                            <div>{isSubmitting && <LinearProgress />}</div>
                            <div>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    disabled={isSubmitting || !dirty}
                                    onClick={submitForm}
                                >
                                    Submit
                                </Button>
                            </div>
                        </Form>
                    )
                }}
            </Formik>
        </TabPanel>
    )
}

function AuthPanel({
    shareUrl,
    disabled,
    isContent,
    isPublic,
    tokens,
    hashAlgorithm,
    ...props
}: Exclude<TabPanelProps, 'children'> & {
    shareUrl: string
    hashAlgorithm: string
    tokens: string[]
    isContent: boolean
    isPublic: boolean
    disabled?: boolean
}) {
    const { mainCtx } = React.useContext(Contexts.Main)
    const { itemClient } = React.useContext(Contexts.Clients)
    const [ntokens, setNTokens] = React.useState<string[]>([])
    const value = {
        action: isPublic ? 'update' : 'view',
    }
    const url = React.useMemo(() => {
        const parsedUrl = new URL(shareUrl)
        parsedUrl.searchParams.set('item', mainCtx.item as string)
        parsedUrl.searchParams.delete('token')
        for (const t of ntokens) {
            parsedUrl.searchParams.append('token', t)
        }
        return parsedUrl.href
    }, [mainCtx.item, shareUrl, ntokens])

    return (
        <TabPanel {...props}>
            <SharePanel url={url} />
            <Formik
                initialValues={{
                    token: null,
                    viewActive: false,
                    view: {
                        value,
                        start: '' as const,
                        stop: '' as const,
                        data: '',
                        note: '',
                        locked: false,
                    },
                    updateActive: false,
                    update: {
                        value: { action: 'update' },
                        start: '' as const,
                        stop: '' as const,
                        data: '',
                        note: '',
                        locked: false,
                    },
                }}
                onSubmit={async ({ token, ...values }, { setSubmitting }) => {
                    if (!token) {
                        setSubmitting(false)
                        return
                    }
                    const newHash = await hashToken(token, hashAlgorithm)
                    const actions: ActionInputEntry[] = []
                    if (values.viewActive) {
                        actions.push({
                            ...values.view,
                            data: token,
                            newHash,
                            type: 'action',
                        })
                    }
                    if (values.updateActive) {
                        actions.push({
                            ...values.update,
                            data: token,
                            newHash,
                            type: 'action',
                        })
                    }
                    const { actions: finishedActions } =
                        await transformActions({
                            actions,
                            hashAlgorithm,
                        })

                    await itemClient.mutate({
                        mutation: addActionsMutation,
                        variables: {
                            ids: [mainCtx.item],
                            authorize: tokens,
                            actions: finishedActions,
                        },
                    })
                    setNTokens([token])
                    setSubmitting(false)
                }}
            >
                {({ values, isSubmitting, dirty, submitForm }) => {
                    return (
                        <Form>
                            <FastField
                                component={TokenSelect}
                                label="Token"
                                freeSolo
                                fullWidth
                                name="token"
                            />
                            {!isPublic ? (
                                <>
                                    <div>
                                        <FastField
                                            component={FormikCheckboxWithLabel}
                                            Label={{ label: 'Add view' }}
                                            name="viewActive"
                                        />
                                    </div>
                                    {values.viewActive ? (
                                        <ActionOrCertificateConfigurator
                                            hashAlgorithm={hashAlgorithm}
                                            path="view."
                                            disabled={disabled}
                                            isContent={isContent}
                                            mode="share"
                                            noToken
                                            lockAction
                                            tokens={tokens}
                                            value={{
                                                type: 'action',
                                                start: '',
                                                stop: '',
                                                value: {
                                                    action: 'view',
                                                },
                                                data: '',
                                                note: '',
                                                newHash: '',
                                            }}
                                        />
                                    ) : null}
                                </>
                            ) : null}
                            <div>
                                <FastField
                                    component={FormikCheckboxWithLabel}
                                    Label={{ label: 'Add update' }}
                                    name="updateActive"
                                />
                            </div>
                            {values.updateActive ? (
                                <ActionOrCertificateConfigurator
                                    hashAlgorithm={hashAlgorithm}
                                    path="update."
                                    disabled={disabled}
                                    noToken
                                    lockAction
                                    isContent={isContent}
                                    mode={isPublic ? 'publicShare' : 'share'}
                                    tokens={tokens}
                                    value={{
                                        type: 'action',
                                        start: '',
                                        stop: '',
                                        value: {
                                            action: 'update',
                                        },
                                        data: '',
                                        note: '',
                                        newHash: '',
                                    }}
                                />
                            ) : null}

                            <div>{isSubmitting && <LinearProgress />}</div>
                            <div>
                                <Button
                                    variant="contained"
                                    color="primary"
                                    disabled={isSubmitting || !dirty}
                                    onClick={submitForm}
                                >
                                    Submit
                                </Button>
                            </div>
                        </Form>
                    )
                }}
            </Formik>
        </TabPanel>
    )
}

function OverviewPanel({
    shareUrl,
    isPublic,
    isContent,
    actions,
    tokens,
    disabled,
    hashAlgorithm,
    ...props
}: Exclude<TabPanelProps, 'children'> & {
    shareUrl: string
    disabled?: boolean
    isContent: boolean
    isPublic: boolean
    actions: (ActionInputEntry | CertificateInputEntry)[]
    hashAlgorithm: string
    tokens: string[]
}) {
    const [selectedItem, setSelectedItem] = React.useState<
        { value: ActionInputEntry; index: number } | undefined
    >(undefined)
    const filteredActions = React.useMemo(() => {
        const filteredActions: {
            value: ActionInputEntry
            index: number
        }[] = []
        actions.forEach((value, index) => {
            if (value.delete) {
                return
            }
            if (value.type == 'action') {
                filteredActions.push({ value, index })
            }
        })
        filteredActions.sort((a, b) =>
            a.value.newHash!.localeCompare(b.value.newHash as string)
        )
        return filteredActions
    }, [actions])
    return (
        <TabPanel {...props}>
            <Stack
                spacing={2}
                divider={<Divider orientation="horizontal" flexItem />}
            >
                <SharePanel url={shareUrl} />
                <div>
                    <TextField label="Search" type="search" />
                </div>
                <Stack
                    direction="row"
                    divider={<Divider orientation="vertical" flexItem />}
                    spacing={2}
                >
                    <div style={{ flex: 1 }}>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Hash</TableCell>
                                        <TableCell padding="checkbox">
                                            Update
                                        </TableCell>
                                        <TableCell padding="none"></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredActions.map((item) => {
                                        return (
                                            <HashEntry
                                                hover
                                                selected={
                                                    selectedItem?.index ==
                                                    item.index
                                                }
                                                noUpgrade
                                                key={item.index}
                                                disabled={disabled}
                                                item={item}
                                                selectItem={(arg) =>
                                                    setSelectedItem(
                                                        arg as {
                                                            value: ActionInputEntry
                                                            index: number
                                                        }
                                                    )
                                                }
                                            />
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </div>
                    {selectedItem && (
                        <Formik
                            enableReinitialize
                            initialValues={{
                                action: selectedItem.value,
                            }}
                            onSubmit={async (values, { setSubmitting }) => {
                                setSubmitting(false)
                            }}
                        >
                            <Form>
                                <ActionOrCertificateConfigurator
                                    path="action."
                                    hashAlgorithm={hashAlgorithm}
                                    disabled={disabled}
                                    isContent={isContent}
                                    tokens={tokens}
                                    mode={isPublic ? 'public' : 'default'}
                                    value={selectedItem.value}
                                />
                            </Form>
                        </Formik>
                    )}
                </Stack>
            </Stack>
        </TabPanel>
    )
}

export default function SimpleShareDialog({
    shareUrl,
    isPublic,
    actions,
    defaultTab = 'new',
    disabled,
    hashAlgorithm,
}: {
    shareUrl?: string
    actions?: (ActionInputEntry | CertificateInputEntry)[]
    isPublic: boolean
    defaultTab?: 'new' | 'auth'
    disabled?: boolean
    hashAlgorithm: string
}) {
    const [tab, setTab] = React.useState(defaultTab)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.Config)
    const dialogTitleId = React.useId()
    const tokens = React.useMemo(() => {
        if (!shareUrl) {
            return []
        }
        if (SetOps.hasIntersection(mainCtx.tokensPermissions, _update_set)) {
            return mainCtx.tokens
        }
        if (!config || (!mainCtx.currentCluster && !mainCtx.item)) {
            return []
        }
        return authInfoFromConfig({
            config,
            url: mainCtx.url as string,
            require: _update_set,
            contents:
                mainCtx.type != 'Cluster'
                    ? new Set([mainCtx.item as string])
                    : undefined,
            clusters: mainCtx.currentCluster
                ? new Set([mainCtx.currentCluster])
                : undefined,
        }).tokens
    }, [
        mainCtx.tokens,
        mainCtx.tokensPermissions,
        mainCtx.item,
        mainCtx.currentCluster,
    ])

    if (!shareUrl) {
        return null
    }
    return (
        <Dialog
            open={mainCtx.openDialog == 'share'}
            onClose={() => updateMainCtx({ openDialog: null })}
            maxWidth="xl"
            fullWidth
            aria-labelledby={dialogTitleId}
            container={document.body}
        >
            <DialogTitle id={dialogTitleId}>Share</DialogTitle>
            <DialogContent>
                <TabContext value={tab}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <TabList
                            onChange={(ev, val) => setTab(val)}
                            aria-label="share object"
                            variant="fullWidth"
                            textColor="primary"
                        >
                            <Tab label="Auth" value="auth" />
                            <Tab label="New" value="new" />
                            {actions && (
                                <Tab label="Overview" value="overview" />
                            )}
                        </TabList>
                    </Box>
                    <AuthPanel
                        value="auth"
                        isPublic={isPublic}
                        tokens={tokens}
                        isContent={mainCtx.type != 'Cluster'}
                        shareUrl={shareUrl}
                        disabled={disabled}
                        hashAlgorithm={hashAlgorithm}
                    />
                    <NewPanel
                        value="new"
                        isPublic={isPublic}
                        tokens={tokens}
                        isContent={mainCtx.type != 'Cluster'}
                        shareUrl={shareUrl}
                        disabled={disabled}
                        hashAlgorithm={hashAlgorithm}
                    />
                    {actions && (
                        <OverviewPanel
                            value="overview"
                            tokens={tokens}
                            actions={actions}
                            isPublic={isPublic}
                            isContent={mainCtx.type != 'Cluster'}
                            shareUrl={shareUrl}
                            disabled={disabled}
                            hashAlgorithm={hashAlgorithm}
                        />
                    )}
                </TabContext>
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={() => updateMainCtx({ openDialog: null })}
                    color="secondary"
                >
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}
