import { ApolloClient, useApolloClient } from '@apollo/client'
import Button from '@material-ui/core/Button'
import Chip from '@material-ui/core/Chip'
import Collapse from '@material-ui/core/Collapse'
import Divider from '@material-ui/core/Divider'
import Drawer from '@material-ui/core/Drawer'
import Hidden from '@material-ui/core/Hidden'
import IconButton from '@material-ui/core/IconButton'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import TextField from '@material-ui/core/TextField'
import Tooltip from '@material-ui/core/Tooltip'
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'
import ExpandLessIcon from '@material-ui/icons/ExpandLess'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import Autocomplete from '@material-ui/lab/Autocomplete'
import * as React from 'react'

import { mapHashNames } from '../../constants'
import * as contexts from '../../contexts'
import { getClusterQuery } from '../../queries/cluster'
import { serverConfigQuery } from '../../queries/server'
import { useStylesAndTheme } from '../../theme'
import { extractPublicInfo } from '../../utils/cluster'
import { extractAuthInfo } from '../../utils/config'
import { loadAndExtractClusterInfo } from '../../utils/operations'
import { CapturingSuspense } from '../misc'
/**const SideBarClusters = React.lazy(() => import('./clusters'))
const SideBarContents = React.lazy(() => import('./contents'))
const SideBarNotifications = React.lazy(() => import('./notifications')) */
import SideBarClusters from './clusters'
import SideBarContents from './contents'
import SideBarNotifications from './notifications'

export default function SideBarHeader({
    headerExpanded,
    setHeaderExpanded,
}: {
    headerExpanded: boolean
    setHeaderExpanded: any
}) {
    const { classes, theme } = useStylesAndTheme()
    const { activeUrl, updateActiveUrl } = React.useContext(contexts.ActiveUrl)
    const { config, updateConfig } = React.useContext(contexts.Config)
    const { updateOpen } = React.useContext(contexts.OpenSidebar)
    const { searchCtx, updateSearchCtx } = React.useContext(contexts.Search)
    const client = useApolloClient()
    const closeButton = (
        <Hidden lgUp>
            <IconButton onClick={() => updateOpen(false)}>
                {theme.direction === 'ltr' ? (
                    <ChevronLeftIcon />
                ) : (
                    <ChevronRightIcon />
                )}
            </IconButton>
        </Hidden>
    )
    const headerElements = (
        <Autocomplete
            onFocus={() => setHeaderExpanded(true)}
            className={classes.sideBarHeaderSelect}
            freeSolo
            value={activeUrl}
            options={Object.keys(config ? config.hosts : {})}
            disableClearable
            onChange={async (event: any, value: any, reason: string) => {
                if (!value) return
                switch (reason) {
                    case 'create-option':
                        if (config && !config.hosts[value]) {
                            const hashAlgos = []
                            try {
                                const result = await client.query({
                                    query: serverConfigQuery,
                                })
                                for (const algo of result.data.secretgraph
                                    .config.hashAlgorithms) {
                                    const mappedName =
                                        mapHashNames[algo].operationName
                                    if (mappedName) {
                                        hashAlgos.push(mappedName)
                                    }
                                }
                            } catch (exc) {
                                console.warn('Cannot add host', exc)
                                return
                            }
                            if (!hashAlgos) {
                                console.warn(
                                    'Cannot add host, no fitting hash algos found'
                                )
                                return
                            }
                            const newConfig = {
                                ...config,
                                hosts: {
                                    ...config.hosts,
                                },
                            }
                            hashAlgos
                            newConfig.hosts[value] = {
                                hashAlgorithms: hashAlgos,
                                clusters: {},
                                contents: {},
                            }
                            updateConfig(newConfig)
                        }
                        updateActiveUrl(value)
                        break
                    case 'select-option':
                        // TODO: update hash list
                        updateActiveUrl(value)
                        break
                    case 'remove-option':
                        if (
                            config &&
                            config.hosts[value] &&
                            Object.keys(config.hosts[value]).length === 0
                        ) {
                            const newConfig = {
                                ...config,
                                clusters: {
                                    ...config.hosts,
                                },
                            }
                            delete newConfig.hosts[value]
                            updateConfig(newConfig)
                        }
                }
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Set Url"
                    variant="outlined"
                    size="small"
                    margin="dense"
                />
            )}
        />
    )
    return (
        <React.Fragment>
            <div>
                <div className={classes.sideBarHeader}>
                    {theme.direction === 'ltr' ? headerElements : null}
                    {closeButton}
                    {theme.direction === 'rtl' ? headerElements : null}
                </div>
                <Button
                    className={classes.sideBarHeaderExpandButton}
                    onClick={() => setHeaderExpanded(!headerExpanded)}
                    size="small"
                >
                    <ExpandMoreIcon
                        className={
                            headerExpanded
                                ? classes.sideBarHeaderExpandButtonIconExpanded
                                : classes.sideBarHeaderExpandButtonIcon
                        }
                    />
                </Button>
            </div>
            <Collapse in={headerExpanded} timeout="auto" unmountOnExit>
                <Autocomplete
                    multiple
                    value={searchCtx.include}
                    freeSolo
                    fullWidth
                    options={searchCtx.include}
                    onChange={(event: any, value: any, reason: string) => {
                        if (!value) return
                        updateSearchCtx({ include: value })
                    }}
                    renderTags={(value: string[], getTagProps: any) =>
                        value.map((option: string, index: number) => (
                            <Chip
                                size="small"
                                variant="outlined"
                                label={option}
                                {...getTagProps({ index })}
                            />
                        ))
                    }
                    renderInput={(params: any) => (
                        <TextField
                            {...params}
                            label="Include Tags"
                            variant="outlined"
                            size="small"
                            margin="dense"
                            multiline
                        />
                    )}
                />
                <Autocomplete
                    multiple
                    value={searchCtx.exclude}
                    freeSolo
                    fullWidth
                    options={searchCtx.exclude}
                    id="tags-excluded"
                    onChange={(event: any, value: any, reason: string) => {
                        if (!value) return
                        updateSearchCtx({ exclude: value })
                    }}
                    renderTags={(value: string[], getTagProps: any) =>
                        value.map((option: string, index: number) => (
                            <Chip
                                size="small"
                                variant="outlined"
                                label={option}
                                {...getTagProps({ index })}
                            />
                        ))
                    }
                    renderInput={(params: any) => (
                        <TextField
                            {...params}
                            label="Exclude tags"
                            variant="outlined"
                            size="small"
                            margin="dense"
                            multiline
                            value={activeUrl}
                        />
                    )}
                />
            </Collapse>
        </React.Fragment>
    )
}
