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
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow, { TableRowProps } from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import { ActionInputEntry } from '@secretgraph/misc/utils/action'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import * as SetOps from '@secretgraph/misc/utils/set'
import { FastField, FieldArray, Form, Formik } from 'formik'
import * as React from 'react'

import * as Contexts from '../../contexts'
import ActionConfigurator, {
    ActionConfiguratorProps,
} from '../forms/ActionConfigurator'

const _update_set = new Set(['update', 'manage'])
function SharePanel({ url }: { url: string }) {
    return (
        <Link
            href={url}
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
    )
}

const HashEntry = React.memo(function HashEntry({
    item,
    disabled,
    selectItem,
    deleteItem,
    ...props
}: Omit<TableRowProps, 'children'> & {
    item: {
        value: ActionInputEntry
        index: number
    }
    disabled?: boolean
    selectItem: (arg: {
        value: ActionInputEntry
        index: number
    }) => void | Promise<void>
    deleteItem?: (arg: {
        value: ActionInputEntry
        index: number
    }) => void | Promise<void>
}) {
    return (
        <TableRow {...props}>
            <TableCell
                size="small"
                onClick={() => selectItem(item)}
                style={{ wordBreak: 'break-all' }}
            >
                {item.value.newHash}
            </TableCell>
            <TableCell size="small">
                {deleteItem ? (
                    <IconButton
                        size="small"
                        edge="end"
                        aria-label="trash"
                        disabled={item.value.readonly}
                        onClick={() =>
                            deleteItem(
                                item as {
                                    value: ActionInputEntry
                                    index: number
                                }
                            )
                        }
                    >
                        <DeleteIcon />
                    </IconButton>
                ) : null}
            </TableCell>
        </TableRow>
    )
})

function NewPanel({
    shareUrl,
    mode,
    isContent,
    tokens,
    ...props
}: Exclude<TabPanelProps, 'children'> & {
    mode: NonNullable<ActionConfiguratorProps['mode']>
    shareUrl: string
    tokens: string[]
    isContent: boolean
}) {
    return (
        <TabPanel {...props}>
            <SharePanel url={shareUrl} />
            <Formik
                initialValues={{}}
                onSubmit={async (values, { setSubmitting }) => {
                    setSubmitting(false)
                }}
            >
                <Form>
                    <ActionConfigurator
                        path=""
                        isContent={isContent}
                        mode={mode}
                        tokens={tokens}
                        value={{
                            type: 'action',
                            start: '',
                            stop: '',
                            value: {
                                action:
                                    mode == 'auth'
                                        ? 'auth'
                                        : mode == 'public'
                                        ? 'update'
                                        : 'view',
                            },
                            data: '',
                            note: '',
                            newHash: '',
                        }}
                    />
                </Form>
            </Formik>
        </TabPanel>
    )
}

function OverviewPanel({
    shareUrl,
    mode,
    isContent,
    actions,
    tokens,
    ...props
}: Exclude<TabPanelProps, 'children'> & {
    mode: NonNullable<ActionConfiguratorProps['mode']>
    shareUrl: string
    isContent: boolean
    actions: ActionInputEntry[]
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
            <Link
                href={shareUrl}
                onClick={(event: any) => {
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(shareUrl)
                        event.preventDefault()
                        console.log('url copied')
                        return false
                    } else {
                        console.log('clipboard not supported')
                    }
                }}
            >
                {shareUrl}
            </Link>
            <Divider sx={{ marginBottom: '5px', marginTop: '5px' }} />
            <div>
                <TextField label="Search" type="search" />
            </div>
            <Divider sx={{ marginBottom: '5px', marginTop: '5px' }} />
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
                                            key={item.value.newHash}
                                            disabled={disabled}
                                            item={item}
                                            selectItem={setSelectedItem}
                                        />
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </div>
                {selectedItem && (
                    <Formik
                        initialValues={{}}
                        onSubmit={async (values, { setSubmitting }) => {
                            setSubmitting(false)
                        }}
                    >
                        <Form>
                            <ActionConfigurator
                                path=""
                                isContent={isContent}
                                tokens={tokens}
                                mode={mode}
                                value={selectedItem.value}
                            />
                        </Form>
                    </Formik>
                )}
            </Stack>
        </TabPanel>
    )
}

export default function SimpleShareDialog({
    shareUrl,
    isPublic,
    actions,
    defaultTab = 'new',
}: {
    shareUrl?: string
    actions?: ActionInputEntry[]
    isPublic: boolean
    defaultTab: 'new' | 'auth'
}) {
    const [tab, setTab] = React.useState(defaultTab)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.Config)
    const [open, setOpen] = React.useState(false)
    const tokens = React.useMemo(() => {
        if (!shareUrl) {
            return []
        }
        if (SetOps.hasIntersection(mainCtx.tokensPermissions, _update_set)) {
            return mainCtx.tokens
        }
        if (!config || (!mainCtx.cluster && !mainCtx.item)) {
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
            clusters: mainCtx.cluster ? new Set([mainCtx.cluster]) : undefined,
        }).tokens
    }, [mainCtx.tokens, mainCtx.tokensPermissions])

    React.useLayoutEffect(() => {
        if (shareUrl) {
            updateMainCtx({ shareFn: () => setOpen(true) })
        }
        return () => {
            updateMainCtx({ shareFn: null })
        }
    }, [shareUrl])
    if (!shareUrl) {
        return null
    }
    return (
        <Dialog
            open={open}
            onClose={() => setOpen(false)}
            maxWidth="xl"
            fullWidth
            aria-labelledby="share-dialog-title"
        >
            <DialogTitle id="share-dialog-title">Share</DialogTitle>
            <DialogContent>
                <TabContext value={tab}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <TabList
                            onChange={(ev, val) => setTab(val)}
                            aria-label="share object"
                            variant="fullWidth"
                            textColor="primary"
                        >
                            <Tab label="New" value="new" />
                            <Tab label="Auth" value="auth" />
                            {actions && (
                                <Tab label="Overview" value="overview" />
                            )}
                        </TabList>
                    </Box>
                    <NewPanel
                        value="new"
                        mode={isPublic ? 'public' : 'default'}
                        tokens={tokens}
                        isContent={mainCtx.type != 'Cluster'}
                        shareUrl={shareUrl}
                    />
                    <NewPanel
                        value="auth"
                        mode="auth"
                        tokens={tokens}
                        isContent={mainCtx.type != 'Cluster'}
                        shareUrl={shareUrl}
                    />
                    {actions && (
                        <OverviewPanel
                            value="overview"
                            tokens={tokens}
                            actions={actions}
                            mode={isPublic ? 'public' : 'default'}
                            isContent={mainCtx.type != 'Cluster'}
                            shareUrl={shareUrl}
                        />
                    )}
                </TabContext>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setOpen(false)} color="secondary">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}
