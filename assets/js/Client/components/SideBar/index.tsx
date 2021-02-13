import * as React from 'react'
import Drawer from '@material-ui/core/Drawer'
import List from '@material-ui/core/List'
import Tooltip from '@material-ui/core/Tooltip'
import TextField from '@material-ui/core/TextField'
import Hidden from '@material-ui/core/Hidden'
import Divider from '@material-ui/core/Divider'
import IconButton from '@material-ui/core/IconButton'
import Button from '@material-ui/core/Button'
import Autocomplete from '@material-ui/lab/Autocomplete'
import Chip from '@material-ui/core/Chip'
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'
import Collapse from '@material-ui/core/Collapse'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import ExpandLessIcon from '@material-ui/icons/ExpandLess'

import { useApolloClient, ApolloClient } from '@apollo/client'

import { useStylesAndTheme } from '../../theme'
import { mapHashNames } from '../../constants'
import { AuthInfoInterface } from '../../interfaces'
import { serverConfigQuery } from '../../queries/server'
import { getClusterQuery } from '../../queries/cluster'
import {
    MainContext,
    SearchContext,
    ActiveUrlContext,
    ConfigContext,
    InitializedConfigContext,
} from '../../contexts'
import { extractAuthInfo } from '../../utils/config'
import { extractPublicInfo } from '../../utils/cluster'
import { CapturingSuspense } from '../misc'
/**const SideBarClusters = React.lazy(() => import('./clusters'))
const SideBarContents = React.lazy(() => import('./contents'))
const SideBarNotifications = React.lazy(() => import('./notifications')) */
import SideBarClusters from './clusters'
import SideBarContents from './contents'
import SideBarNotifications from './notifications'

type SideBarProps = {
    openState: any
}

type SideBarHeaderProps = {
    closeButton: any
    headerExpanded: boolean
    setHeaderExpanded: any
}

const SideBarHeader = (props: SideBarHeaderProps) => {
    const { classes, theme } = useStylesAndTheme()
    const { closeButton, headerExpanded, setHeaderExpanded } = props
    const { activeUrl, updateActiveUrl } = React.useContext(ActiveUrlContext)
    const { config, updateConfig } = React.useContext(ConfigContext)
    const { searchCtx, updateSearchCtx } = React.useContext(SearchContext)
    const client = useApolloClient()
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

async function title_helper({
    client,
    keys,
    item,
    cancel,
    setName,
    setNote,
}: {
    client: ApolloClient<any>
    keys: string[]
    item: string
    cancel: () => boolean
    setName: (arg: string) => void
    setNote: (arg: string) => void
}) {
    const { data } = await client.query({
        query: getClusterQuery,
        variables: {
            id: item,
            authorization: keys,
        },
    })
    const { name, note } = extractPublicInfo(
        data.secretgraph.node.publicInfo,
        false
    )
    if (cancel()) {
        return
    }
    name && setName(name)
    note && setNote(note)
}

const ActiveElements = ({
    setOpenMenu,
    setHeaderExpanded,
    ...props
}: {
    openMenu: string
    setOpenMenu: any
    setHeaderExpanded: any
}) => {
    const { classes, theme } = useStylesAndTheme()
    const { config } = React.useContext(InitializedConfigContext)
    const { activeUrl } = React.useContext(ActiveUrlContext)
    const { searchCtx, updateSearchCtx } = React.useContext(SearchContext)
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const client = useApolloClient()
    const [clusterName, setClusterName] = React.useState(searchCtx.cluster)
    const [clusterNote, setClusterNote] = React.useState('')
    const { keys } = extractAuthInfo({ config, url: activeUrl })

    React.useLayoutEffect(() => {
        if (!searchCtx.cluster) {
            return
        }
        setClusterName(searchCtx.cluster)

        let finished = false
        const cancel = () => {
            finished = true
        }
        title_helper({
            client,
            keys,
            item: searchCtx.cluster,
            setName: setClusterName,
            setNote: setClusterNote,
            cancel: () => finished == true,
        })
        return cancel
    }, [searchCtx.cluster, mainCtx.type == 'Cluster' ? mainCtx.updateId : ''])

    const closedSymbol =
        theme.direction === 'ltr' ? (
            <ChevronRightIcon key="closedicoltr" />
        ) : (
            <ChevronLeftIcon key="closedicortl" />
        )
    const activeElements = []
    if (searchCtx.cluster) {
        const inner = (
            <ListItem
                button
                key="clusters:show:known"
                onClick={() => {
                    if (props.openMenu === 'clusters') {
                        setOpenMenu('notifications')
                    } else {
                        setOpenMenu('clusters')
                    }
                    updateMainCtx({
                        item: searchCtx.cluster,
                        url: activeUrl,
                        type: 'Cluster',
                        action: 'view',
                    })
                    setHeaderExpanded(false)
                }}
            >
                {props.openMenu === 'clusters' ? (
                    <ExpandMoreIcon />
                ) : (
                    closedSymbol
                )}
                <ListItemText
                    key={'clusters:show:known.text'}
                    className={classes.sideBarEntry}
                    primary={`Cluster: ${clusterName}`}
                />
            </ListItem>
        )
        if (clusterNote) {
            activeElements.push(
                <Tooltip key="clusters:show:known:tooltip" title={clusterNote}>
                    {inner}
                </Tooltip>
            )
        } else {
            activeElements.push(inner)
        }
    } else {
        activeElements.push(
            <ListItem
                button
                key="clusters:show:unknown"
                onClick={() => {
                    if (props.openMenu === 'clusters') {
                        setOpenMenu('notifications')
                    } else {
                        setOpenMenu('clusters')
                    }
                    updateMainCtx({
                        item: null,
                        updateId: null,
                        type: 'Cluster',
                        action: 'view',
                    })
                    setHeaderExpanded(false)
                }}
            >
                {closedSymbol}
                <ListItemText
                    key="clusters:show:unknown.text"
                    className={classes.sideBarEntry}
                    primary={
                        props.openMenu === 'clusters'
                            ? 'Show Notifications'
                            : 'Show Clusters'
                    }
                />
            </ListItem>
        )
    }
    if (mainCtx.item && mainCtx.type != 'Cluster') {
        activeElements.push(
            <ListItem
                button
                className={classes.sideBarContentList}
                key="content:show"
                onClick={() => {
                    if (props.openMenu === 'contents') {
                        setOpenMenu('notifications')
                    } else {
                        setOpenMenu('contents')
                    }
                }}
            >
                {props.openMenu === 'contents' ? (
                    <ExpandMoreIcon />
                ) : (
                    closedSymbol
                )}
                <ListItemText
                    key="content:show.text"
                    className={classes.sideBarEntry}
                    primary={`Content: ${mainCtx.type}: ${mainCtx.item}`}
                />
            </ListItem>
        )
    }
    return <List>{...activeElements}</List>
}

const SideBarItems = ({
    setHeaderExpanded,
    setOpenMenu,
    ...props
}: {
    openMenu: string
    setHeaderExpanded: any
    setOpenMenu: any
}) => {
    const { classes, theme } = useStylesAndTheme()
    const { config } = React.useContext(InitializedConfigContext)
    const { activeUrl } = React.useContext(ActiveUrlContext)
    const { searchCtx, updateSearchCtx } = React.useContext(SearchContext)
    const { mainCtx, updateMainCtx } = React.useContext(MainContext)
    const authinfo = extractAuthInfo({ config, url: activeUrl })
    const sideBarItems = []

    switch (props.openMenu) {
        case 'notifications':
            sideBarItems.push(
                <SideBarNotifications
                    key="SideBarNotifications"
                    authinfo={authinfo}
                    header={'Notifications'}
                />
            )
            break
        case 'contents':
            sideBarItems.push(
                <SideBarContents
                    key="SideBarContentsPublic"
                    activeCluster={searchCtx.cluster}
                    activeContent={mainCtx.item}
                    usePublic
                    header="Public"
                    selectItem={(content: any) => {
                        let type = content.tags.find((flag: string) =>
                            flag.startsWith('type=')
                        )
                        if (type) {
                            // split works different in js, so 2
                            type = type.match(/=(.*)/)[1]
                        }
                        if (type == 'PrivateKey') {
                            type = 'PublicKey'
                        }
                        const url = new URL(activeUrl)
                        updateMainCtx({
                            action: 'view',
                            type: type,
                            item: content.id,
                            updateId: content.updateId,
                            url: activeUrl,
                            shareUrl: `${url.origin}${content.link}`,
                        })
                        setHeaderExpanded(false)
                        setOpenMenu('notifications')
                    }}
                />
            )
            sideBarItems.push(
                <SideBarContents
                    key="SideBarContentsInternal"
                    authinfo={authinfo}
                    activeCluster={searchCtx.cluster}
                    activeContent={mainCtx.item}
                    header="Internal"
                    state="internal"
                    selectItem={(content: any) => {
                        let type = content.tags.find((flag: string) =>
                            flag.startsWith('type=')
                        )
                        if (type) {
                            // split works different in js, so 2
                            type = type.match(/=(.*)/)[1]
                        }
                        if (type == 'PrivateKey') {
                            type = 'PublicKey'
                        }
                        const url = new URL(activeUrl)
                        updateMainCtx({
                            action: 'view',
                            type: type,
                            item: content.id,
                            updateId: content.updateId,
                            url: activeUrl,
                            shareUrl: `${url.origin}${content.link}`,
                        })
                        setHeaderExpanded(false)
                        setOpenMenu('notifications')
                    }}
                />
            )
            break
        case 'clusters':
            sideBarItems.push(
                <SideBarClusters
                    key="SideBarClusters"
                    authinfo={authinfo}
                    activeCluster={searchCtx.cluster}
                    header="Clusters"
                    selectItem={(cluster: any) => {
                        const url = new URL(activeUrl)
                        updateMainCtx({
                            item: cluster.id,
                            updateId: cluster.updateId,
                            type: 'Cluster',
                            action: 'view',
                            url: activeUrl,
                            shareUrl: `${url.origin}${cluster.link}`,
                        })
                        updateSearchCtx({
                            cluster: cluster.id,
                        })
                        setHeaderExpanded(false)
                        setOpenMenu('contents')
                    }}
                />
            )
            break
    }
    return (
        <div className={classes.sideBarBody}>
            <CapturingSuspense>{...sideBarItems}</CapturingSuspense>
        </div>
    )
}

const SideBar = (props: SideBarProps) => {
    const { classes, theme } = useStylesAndTheme()
    const { openState } = props
    const { config } = React.useContext(ConfigContext)
    const [headerExpanded, setHeaderExpanded] = React.useState(false)
    const [openMenu, setOpenMenu] = React.useState('notifications')
    let activeElements: any = null
    let sideBarItems: any = null
    const closeButton = (
        <Hidden lgUp>
            <IconButton onClick={() => openState.setDrawerOpen(false)}>
                {theme.direction === 'ltr' ? (
                    <ChevronLeftIcon key="closeicoltr" />
                ) : (
                    <ChevronRightIcon key="closeicortl" />
                )}
            </IconButton>
        </Hidden>
    )
    if (config) {
        activeElements = (
            <ActiveElements
                openMenu={openMenu}
                setHeaderExpanded={setHeaderExpanded}
                setOpenMenu={setOpenMenu}
            />
        )

        sideBarItems = (
            <SideBarItems
                openMenu={openMenu}
                setHeaderExpanded={setHeaderExpanded}
                setOpenMenu={setOpenMenu}
            />
        )
    }
    return (
        <Drawer
            variant="persistent"
            anchor={theme.direction === 'ltr' ? 'left' : 'right'}
            open={!!(openState.drawerOpen && config)}
            classes={{
                paper: classes.drawerPaper,
            }}
        >
            <SideBarHeader
                closeButton={closeButton}
                headerExpanded={headerExpanded}
                setHeaderExpanded={setHeaderExpanded}
            />
            <Divider />
            {activeElements}
            <Divider />
            {sideBarItems}
        </Drawer>
    )
}

export default SideBar
