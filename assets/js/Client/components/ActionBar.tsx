import * as React from 'react'
import Toolbar from '@material-ui/core/Toolbar'
import Tooltip from '@material-ui/core/Tooltip'
import IconButton from '@material-ui/core/IconButton'
import AddIcon from '@material-ui/icons/Add'
import EditIcon from '@material-ui/icons/Edit'
import ShareIcon from '@material-ui/icons/Share'
import VisibilityIcon from '@material-ui/icons/Visibility'
import DeleteIcon from '@material-ui/icons/Delete'
import RestoreFromTrashIcon from '@material-ui/icons/RestoreFromTrash'
import NativeSelect from '@material-ui/core/NativeSelect'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogTitle from '@material-ui/core/DialogTitle'
import Button from '@material-ui/core/Button'
import DialogContent from '@material-ui/core/DialogContent'
import Link from '@material-ui/core/Link'
import HelpOutlineOutlinedIcon from '@material-ui/icons/HelpOutlineOutlined'
import { useApolloClient } from '@apollo/client'
import { elements } from '../editors'
import { contentStates } from '../constants'
import { MainContext, InitializedConfigContext } from '../contexts'
import { useStylesAndTheme } from '../theme'
import { deleteNode, resetDeletionNode } from '../utils/operations'
import { extractAuthInfo } from '../utils/config'

type Props = {}

function createOptionsIterator(mapObject: Map<string, any>) {
    return {
        *[Symbol.iterator]() {
            for (const [key, value] of mapObject) {
                yield (
                    <option value={key} key={key}>
                        {value.label}
                    </option>
                )
            }
        },
    }
}

function ActionBar(props: Props) {
    const { classes, theme } = useStylesAndTheme()
    const [shareOpen, setShareOpen] = React.useState(false)
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const { config } = React.useContext(InitializedConfigContext)
    const client = useApolloClient()

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
                <Tooltip title="Select state of content" arrow>
                    <NativeSelect
                        className={classes.contentStateSelect}
                        onChange={(event: any) =>
                            updateMainCtx({
                                state: event.target.value,
                            })
                        }
                        value={mainCtx.state || 'default'}
                        children={createOptionsIterator(contentStates)}
                    />
                </Tooltip>
                <Tooltip
                    title={mainCtx.action === 'view' ? 'Edit' : 'View'}
                    arrow
                    className={mainCtx.item ? null : classes.hidden}
                >
                    <IconButton
                        className={classes.actionToolBarButton}
                        aria-label={mainCtx.action === 'view' ? 'Edit' : 'View'}
                        onClick={() =>
                            updateMainCtx({
                                action:
                                    mainCtx.action === 'view' ? 'edit' : 'view',
                            })
                        }
                    >
                        {mainCtx.action === 'view' ? (
                            <EditIcon />
                        ) : (
                            <VisibilityIcon />
                        )}
                    </IconButton>
                </Tooltip>
                <Tooltip
                    title={
                        mainCtx.deleted
                            ? 'Restore'
                            : mainCtx.deleted === false
                            ? 'Deletion not possible, config cluster'
                            : 'Delete'
                    }
                    arrow
                    className={!mainCtx.item ? classes.hidden : null}
                >
                    <span>
                        <IconButton
                            disabled={mainCtx.deleted === false}
                            className={classes.actionToolBarButton}
                            aria-label={
                                mainCtx.deleted
                                    ? 'Restore'
                                    : mainCtx.deleted === false
                                    ? 'Deletion not possible, config cluster'
                                    : 'Delete'
                            }
                            onClick={async () => {
                                const authkeys = extractAuthInfo({
                                    config,
                                    url: mainCtx.url as string,
                                    require: new Set(['delete', 'manage']),
                                }).keys
                                if (mainCtx.deleted) {
                                    const { data } = await resetDeletionNode({
                                        client,
                                        id: mainCtx.item as string,
                                        authorization: authkeys,
                                    })
                                    updateMainCtx({
                                        deleted:
                                            data.resetDeletionContentOrCluster
                                                .deleted,
                                    })
                                } else {
                                    const { data } = await deleteNode({
                                        client,
                                        id: mainCtx.item as string,
                                        authorization: authkeys,
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
                        <NativeSelect
                            className={classes.newItemSelect}
                            onChange={(event: any) => {
                                updateMainCtx({
                                    action: 'add',
                                    title: null,
                                    item: null,
                                    shareUrl: null,
                                    deleted: null,
                                    type: event.target.value,
                                })
                            }}
                            value={mainCtx.type || undefined}
                            children={createOptionsIterator(elements)}
                        />
                        <IconButton
                            className={
                                mainCtx.action != 'add'
                                    ? classes.actionToolBarButton
                                    : classes.hidden
                            }
                            aria-label="add"
                            onClick={(event) => {
                                updateMainCtx({
                                    action: 'add',
                                    title: null,
                                    item: null,
                                    shareUrl: null,
                                    deleted: null,
                                    type: mainCtx.type,
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
                    className={mainCtx.shareUrl ? null : classes.hidden}
                >
                    <IconButton
                        className={classes.actionToolBarButton}
                        aria-label="share "
                        onClick={() => setShareOpen(true)}
                    >
                        <ShareIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Help" arrow>
                    <IconButton
                        className={classes.actionToolBarButton}
                        aria-label="help"
                    >
                        <HelpOutlineOutlinedIcon />
                    </IconButton>
                </Tooltip>
            </Toolbar>
        </nav>
    )
}

export default ActionBar
