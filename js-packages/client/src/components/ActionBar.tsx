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
} from '@secretgraph/misc/utils/operations/node'
import * as SetOps from '@secretgraph/misc/utils/set'
import MapSelect from '@secretgraph/ui-components/MapSelect'
import * as React from 'react'

import * as Contexts from '../contexts'
import { elements } from '../editors'

const _update_set = new Set(['update', 'manage'])
const _create_set = new Set(['create', 'manage'])

type Props = {}

function ActionBar(props: Props) {
    const theme = useTheme()
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const client = useApolloClient()

    const updateTokens = React.useMemo(() => {
        if (SetOps.hasIntersection(mainCtx.tokensPermissions, _update_set)) {
            return mainCtx.tokens
        }
        if (
            !config ||
            (!mainCtx.currentCluster && !mainCtx.item) ||
            mainCtx.readonly
        ) {
            return []
        }
        return authInfoFromConfig({
            config,
            url: mainCtx.url || activeUrl,
            require: _update_set,
            contents:
                mainCtx.type != 'Cluster' && mainCtx.item
                    ? new Set([mainCtx.item])
                    : undefined,
            clusters: mainCtx.currentCluster
                ? new Set([mainCtx.currentCluster])
                : undefined,
        }).tokens
    }, [mainCtx.tokens, mainCtx.readonly, mainCtx.tokensPermissions])

    const createTokens = React.useMemo(() => {
        if (SetOps.hasIntersection(mainCtx.tokensPermissions, _create_set)) {
            return mainCtx.tokens
        }
        if (!config) {
            return []
        }
        return authInfoFromConfig({
            config,
            url: activeUrl,
            require: _create_set,
        }).tokens
    }, [mainCtx.tokens, mainCtx.tokensPermissions, activeUrl, config])
    if (mainCtx.type == 'loading') {
        return null
    }

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
                    // fixes chrome issues
                    '& option': {
                        color: 'black',
                    },
                }}
            >
                {config ? (
                    <>
                        <Tooltip
                            title={mainCtx.action === 'view' ? 'Edit' : 'View'}
                            arrow
                            style={{
                                display:
                                    mainCtx.item &&
                                    (mainCtx.action !== 'view' ||
                                        !mainCtx.readonly)
                                        ? undefined
                                        : 'none',
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
                                            tokensPermissions:
                                                mainCtx.action == 'update'
                                                    ? SetOps.union(
                                                          mainCtx.tokensPermissions,
                                                          ['update']
                                                      )
                                                    : undefined,
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
                                                    data.secretgraph.deleted,
                                                updateId: null,
                                            })
                                        } else {
                                            const { data } = await deleteNodes(
                                                {
                                                    client,
                                                    ids: [
                                                        mainCtx.item as string,
                                                    ],
                                                    authorization: authtokens,
                                                }
                                            )
                                            updateMainCtx({
                                                deleted:
                                                    data.secretgraph
                                                        .deleteContentOrCluster
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
                                        direction: 'rtl',
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
                                            action: 'create',
                                            title: '',
                                            item: null,
                                            url: activeUrl,
                                            shareFn: null,
                                            deleted: null,
                                            type: event.currentTarget.value,
                                            /*currentCluster:
                                                searchCtx.cluster ||
                                                config.configCluster,
                                            editCluster:
                                                searchCtx.cluster ||
                                                config.configCluster,*/
                                            tokens: createTokens,
                                            cloneData: null,
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
                        <Tooltip title="Clone">
                            <span>
                                <IconButton
                                    style={{
                                        display:
                                            mainCtx.cloneData === null ||
                                            !mainCtx.type
                                                ? 'none'
                                                : undefined,
                                    }}
                                    color="inherit"
                                    aria-label="create"
                                    disabled={!createTokens.length}
                                    onClick={(event) => {
                                        const cloneQuery =
                                            new URLSearchParams()
                                        if (mainCtx.url) {
                                            cloneQuery.append(
                                                'url',
                                                mainCtx.url
                                            )
                                        }
                                        cloneQuery.append('action', 'clone')
                                        cloneQuery.append(
                                            'type',
                                            mainCtx.type as string
                                        )
                                        ;(window as any).cloneData =
                                            mainCtx.cloneData
                                        const url = new URL(
                                            window.location.href
                                        )
                                        url.hash = `${cloneQuery}`
                                        // we have the opener
                                        window.open(`${url}`, '_blank')
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
                                    onClick={
                                        mainCtx.shareFn as NonNullable<
                                            typeof mainCtx.shareFn
                                        >
                                    }
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
