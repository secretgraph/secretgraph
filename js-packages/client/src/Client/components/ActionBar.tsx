import { useApolloClient } from '@apollo/client'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import FileCopyIcon from '@mui/icons-material/FileCopy'
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined'
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash'
import ShareIcon from '@mui/icons-material/Share'
import VisibilityIcon from '@mui/icons-material/Visibility'
import IconButton from '@mui/material/IconButton'
import { useTheme } from '@mui/material/styles'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
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
            SetOps.hasIntersection(mainCtx.tokensPermissions, [
                'update',
                'manage',
            ])
        ) {
            return mainCtx.tokens
        }
        if (!config) {
            return []
        }
        return authInfoFromConfig({
            config,
            url: mainCtx.url || activeUrl,
            require: new Set(['update', 'manage']),
        }).tokens
    }, [mainCtx.tokens, mainCtx.tokensPermissions])

    const createTokens = React.useMemo(() => {
        if (
            SetOps.hasIntersection(mainCtx.tokensPermissions, [
                'create',
                'manage',
            ])
        ) {
            return mainCtx.tokens
        }
        if (!config) {
            return []
        }
        return authInfoFromConfig({
            config,
            url: activeUrl,
            require: new Set(['create', 'manage']),
        }).tokens
    }, [mainCtx.tokens, mainCtx.tokensPermissions, activeUrl, config])

    return (
        <nav
            style={{
                display: 'flex' as const,
                alignItems: 'center' as const,
                justifyContent: 'flex-end' as const,
            }}
        >
            <div style={{ flexGrow: 1 }} />
            <Toolbar
                sx={{
                    backgroundColor: 'blue',
                    color: 'white',
                    padding: 0,
                    borderRadius: '15px 15px 0 0',
                    border: '1px solid black',
                    margin: theme.spacing(0, 1, 0, 0),
                    '& *': {
                        color: 'white',
                    },
                }}
            >
                {config ? (
                    <>
                        <Tooltip
                            title={mainCtx.action === 'view' ? 'Edit' : 'View'}
                            arrow
                            style={{
                                display: mainCtx.item ? undefined : 'none',
                            }}
                        >
                            <span>
                                <IconButton
                                    color="inherit"
                                    aria-label={
                                        mainCtx.action === 'view'
                                            ? 'Edit'
                                            : 'View'
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
                                    size="large"
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
                            style={{
                                display: !mainCtx.item ? 'none' : undefined,
                            }}
                        >
                            <span>
                                <IconButton
                                    disabled={
                                        mainCtx.deleted === false || !config
                                    }
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
                                        const authtokens = authInfoFromConfig({
                                            config,
                                            url: mainCtx.url as string,
                                            require: new Set([
                                                'delete',
                                                'manage',
                                            ]),
                                        }).tokens
                                        if (mainCtx.deleted) {
                                            const { data } =
                                                await resetDeletionNodes({
                                                    client,
                                                    ids: [
                                                        mainCtx.item as string,
                                                    ],
                                                    authorization: authtokens,
                                                })
                                            updateMainCtx({
                                                deleted:
                                                    data
                                                        .resetDeletionContentOrCluster
                                                        .deleted,
                                                updateId: null,
                                            })
                                        } else {
                                            const { data } = await deleteNodes({
                                                client,
                                                ids: [mainCtx.item as string],
                                                authorization: authtokens,
                                            })
                                            updateMainCtx({
                                                deleted:
                                                    data.deleteContentOrCluster
                                                        .deleted,
                                                updateId: null,
                                            })
                                        }
                                    }}
                                    size="large"
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
                                    sx={{
                                        color: 'white',
                                        direction: 'rtl' as const,
                                        verticalAlign: 'middle !important',
                                        '& .MuiInputBase-root': {
                                            color: 'white !important',
                                            fontSize: '120% !important',
                                            '& .Mui-disabled': {
                                                WebkitTextFillColor:
                                                    'white !important',
                                                color: 'white !important',
                                            },
                                        },
                                    }}
                                    disabled={!createTokens.length}
                                    onChange={(event) => {
                                        updateMainCtx({
                                            action: 'add',
                                            title: '',
                                            item: null,
                                            url: activeUrl,
                                            shareFn: null,
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
                            </span>
                        </Tooltip>
                        <Tooltip title="Clone type">
                            <span>
                                <IconButton
                                    style={{
                                        display:
                                            mainCtx.action == 'add'
                                                ? 'none'
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
                                            shareFn: null,
                                            deleted: null,
                                            type: mainCtx.type,
                                            tokens: createTokens,
                                        })
                                    }}
                                    size="large"
                                >
                                    <FileCopyIcon />
                                </IconButton>
                            </span>
                        </Tooltip>

                        <Tooltip
                            title="Share "
                            arrow
                            style={{
                                display: mainCtx.shareFn ? undefined : 'none',
                            }}
                        >
                            <span>
                                <IconButton
                                    color="inherit"
                                    aria-label="share"
                                    onClick={() => setShareOpen(true)}
                                    size="large"
                                >
                                    <ShareIcon />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </>
                ) : null}
                <Tooltip title="Help" arrow>
                    <span>
                        <IconButton
                            color="inherit"
                            aria-label="help"
                            size="large"
                        >
                            <HelpOutlineOutlinedIcon />
                        </IconButton>
                    </span>
                </Tooltip>
            </Toolbar>
        </nav>
    )
}

export default ActionBar
