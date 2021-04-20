import { useApolloClient } from '@apollo/client'
import Button from '@material-ui/core/Button'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogTitle from '@material-ui/core/DialogTitle'
import IconButton from '@material-ui/core/IconButton'
import Link from '@material-ui/core/Link'
import NativeSelect from '@material-ui/core/NativeSelect'
import Toolbar from '@material-ui/core/Toolbar'
import Tooltip from '@material-ui/core/Tooltip'
import AddIcon from '@material-ui/icons/Add'
import DeleteIcon from '@material-ui/icons/Delete'
import EditIcon from '@material-ui/icons/Edit'
import HelpOutlineOutlinedIcon from '@material-ui/icons/HelpOutlineOutlined'
import RestoreFromTrashIcon from '@material-ui/icons/RestoreFromTrash'
import ShareIcon from '@material-ui/icons/Share'
import VisibilityIcon from '@material-ui/icons/Visibility'
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'
import { useStylesAndTheme } from '../theme'
import { extractAuthInfo } from '../utils/config'
import { deleteNodes, resetDeletionNodes } from '../utils/operations'
import * as SetOps from '../utils/set'
import MapSelect from './MapSelect'

type Props = {}

function ActionBar(props: Props) {
    const { classes, theme } = useStylesAndTheme()
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
            url: mainCtx.url || activeUrl,
            require: new Set(['create', 'manage']),
        }).tokens
    }, [mainCtx.tokens, mainCtx.tokenPermissions])

    return (
        <nav className={classes.actionToolBarOuter}>
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
            <Toolbar className={classes.actionToolBarInner}>
                <Tooltip
                    title={mainCtx.action === 'view' ? 'Edit' : 'View'}
                    arrow
                    className={mainCtx.item ? undefined : classes.hidden}
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
                        >
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
                    className={!mainCtx.item ? classes.hidden : undefined}
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
                        >
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
                                root: classes.newItemSelect,
                            }}
                            disabled={!createTokens.length}
                            onChange={(event: any) => {
                                updateMainCtx({
                                    action: 'add',
                                    title: '',
                                    item: null,
                                    url: mainCtx.url || activeUrl,
                                    shareUrl: null,
                                    deleted: null,
                                    type: event.target.value,
                                    tokens: createTokens,
                                })
                            }}
                            value={mainCtx.type || undefined}
                            options={elements}
                            InputProps={{
                                disableUnderline: true,
                            }}
                        />
                        <IconButton
                            className={
                                mainCtx.action == 'add'
                                    ? classes.hidden
                                    : undefined
                            }
                            color="inherit"
                            aria-label="add"
                            disabled={!createTokens.length}
                            onClick={(event) => {
                                updateMainCtx({
                                    action: 'add',
                                    title: '',
                                    item: null,
                                    updateId: null,
                                    shareUrl: null,
                                    deleted: null,
                                    type: mainCtx.type,
                                    tokens: createTokens,
                                })
                            }}
                        >
                            <AddIcon />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip
                    title="Share "
                    arrow
                    className={mainCtx.shareUrl ? undefined : classes.hidden}
                >
                    <span>
                        <IconButton
                            color="inherit"
                            aria-label="share"
                            onClick={() => setShareOpen(true)}
                        >
                            <ShareIcon />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Help" arrow>
                    <span>
                        <IconButton color="inherit" aria-label="help">
                            <HelpOutlineOutlinedIcon />
                        </IconButton>
                    </span>
                </Tooltip>
            </Toolbar>
        </nav>
    )
}

export default ActionBar
