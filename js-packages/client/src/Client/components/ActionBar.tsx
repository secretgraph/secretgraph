import { useApolloClient } from '@apollo/client'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import NativeSelect from '@mui/material/NativeSelect'
import { useTheme } from '@mui/material/styles'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined'
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash'
import ShareIcon from '@mui/icons-material/Share'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { extractAuthInfo } from '@secretgraph/misc/utils/config'
import {
    deleteNodes,
    resetDeletionNodes,
} from '@secretgraph/misc/utils/operations'
import * as SetOps from '@secretgraph/misc/utils/set'
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'
import MapSelect from './MapSelect'

type Props = {}

function ActionBar(props: Props) {
    const theme = useTheme()
    const [shareOpen, setShareOpen] = React.useState(false)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const client = useApolloClient()
    const updateTokens = React.useMemo(() => {
        if (
            SetOps.hasIntersection(mainCtx.tokenPermissions, [
                'update',
                'manage',
            ])
        ) {
            return mainCtx.tokens
        }
        if (!config) {
            return []
        }
        return extractAuthInfo({
            config,
            url: mainCtx.url || activeUrl,
            require: new Set(['update', 'manage']),
        }).tokens
    }, [mainCtx.tokens, mainCtx.tokenPermissions])

    const createTokens = React.useMemo(() => {
        if (
            SetOps.hasIntersection(mainCtx.tokenPermissions, [
                'create',
                'manage',
            ])
        ) {
            return mainCtx.tokens
        }
        if (!config) {
            return []
        }
        return extractAuthInfo({
            config,
            url: activeUrl,
            require: new Set(['create', 'manage']),
        }).tokens
    }, [mainCtx.tokens, mainCtx.tokenPermissions, activeUrl, config])

    return (
        <nav
            style={{
                display: 'flex' as const,
                alignItems: 'center' as const,
                justifyContent: 'flex-end' as const,
            }}
        >
            <Dialog
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                aria-labelledby="share-dialog-title"
            >
                <DialogTitle id="share-dialog-title">Share</DialogTitle>
                <DialogContent>
                    <Link
                        href={'' + mainCtx.shareUrl}
                        onClick={(event: any) => {
                            if (navigator.clipboard) {
                                navigator.clipboard.writeText(
                                    '' + mainCtx.shareUrl
                                )
                                event.preventDefault()
                                console.log('url copied')
                                return false
                            } else {
                                console.log('clipboard not supported')
                            }
                        }}
                    >
                        {mainCtx.shareUrl}
                    </Link>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setShareOpen(false)}
                        color="secondary"
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
            <div style={{ flexGrow: 1 }} />
            <Toolbar className={theme.classes.actionToolBarInner}>
                <Tooltip
                    title={mainCtx.action === 'view' ? 'Edit' : 'View'}
                    arrow
                    style={{ display: mainCtx.item ? undefined : 'hidden' }}
                >
                    <span>
                        <IconButton
                            color="inherit"
                            aria-label={
                                mainCtx.action === 'view' ? 'Edit' : 'View'
                            }
                            disabled={
                                mainCtx.action == 'update'
                                    ? !updateTokens.length
                                    : !mainCtx.tokens.length
                            }
                            onClick={() =>
                                updateMainCtx({
                                    action:
                                        mainCtx.action === 'view'
                                            ? 'update'
                                            : 'view',
                                    tokens:
                                        mainCtx.action == 'update'
                                            ? updateTokens
                                            : mainCtx.tokens,
                                })
                            }
                            size="large">
                            {mainCtx.action === 'view' ? (
                                <EditIcon />
                            ) : (
                                <VisibilityIcon />
                            )}
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip
                    title={
                        mainCtx.deleted
                            ? 'Restore'
                            : mainCtx.deleted === false
                            ? 'Deletion blocked'
                            : 'Delete'
                    }
                    arrow
                    style={{ display: !mainCtx.item ? 'hidden' : undefined }}
                >
                    <span>
                        <IconButton
                            disabled={mainCtx.deleted === false || !config}
                            color="inherit"
                            aria-label={
                                mainCtx.deleted
                                    ? 'Restore'
                                    : mainCtx.deleted === false
                                    ? 'Deletion blocked'
                                    : 'Delete'
                            }
                            onClick={async () => {
                                if (!config) {
                                    return []
                                }
                                const authtokens = extractAuthInfo({
                                    config,
                                    url: mainCtx.url as string,
                                    require: new Set(['delete', 'manage']),
                                }).tokens
                                if (mainCtx.deleted) {
                                    const { data } = await resetDeletionNodes({
                                        client,
                                        ids: [mainCtx.item as string],
                                        authorization: authtokens,
                                    })
                                    updateMainCtx({
                                        deleted:
                                            data.resetDeletionContentOrCluster
                                                .deleted,
                                    })
                                } else {
                                    const { data } = await deleteNodes({
                                        client,
                                        ids: [mainCtx.item as string],
                                        authorization: authtokens,
                                    })
                                    updateMainCtx({
                                        deleted:
                                            data.deleteContentOrCluster.deleted,
                                    })
                                }
                            }}
                            size="large">
                            {mainCtx.deleted ? (
                                <RestoreFromTrashIcon />
                            ) : (
                                <DeleteIcon />
                            )}
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Add Element" arrow>
                    <span>
                        <MapSelect
                            classes={{
                                root: theme.classes.newItemSelect,
                            }}
                            disabled={!createTokens.length}
                            onChange={(event) => {
                                updateMainCtx({
                                    action: 'add',
                                    title: '',
                                    item: null,
                                    url: activeUrl,
                                    shareUrl: null,
                                    deleted: null,
                                    type: event.currentTarget.value,
                                    tokens: createTokens,
                                })
                            }}
                            value={mainCtx.type || undefined}
                            options={elements}
                            variant="standard"
                            InputProps={{
                                disableUnderline: true,
                            }}
                        />
                        <IconButton
                            style={{
                                display:
                                    mainCtx.action == 'add'
                                        ? 'hidden'
                                        : undefined,
                            }}
                            color="inherit"
                            aria-label="add"
                            disabled={!createTokens.length}
                            onClick={(event) => {
                                updateMainCtx({
                                    action: 'add',
                                    title: '',
                                    item: null,
                                    url: activeUrl,
                                    updateId: null,
                                    shareUrl: null,
                                    deleted: null,
                                    type: mainCtx.type,
                                    tokens: createTokens,
                                })
                            }}
                            size="large">
                            <AddIcon />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip
                    title="Share "
                    arrow
                    style={{
                        display: mainCtx.shareUrl ? undefined : 'hidden',
                    }}
                >
                    <span>
                        <IconButton
                            color="inherit"
                            aria-label="share"
                            onClick={() => setShareOpen(true)}
                            size="large">
                            <ShareIcon />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Help" arrow>
                    <span>
                        <IconButton color="inherit" aria-label="help" size="large">
                            <HelpOutlineOutlinedIcon />
                        </IconButton>
                    </span>
                </Tooltip>
            </Toolbar>
        </nav>
    );
}

export default ActionBar
