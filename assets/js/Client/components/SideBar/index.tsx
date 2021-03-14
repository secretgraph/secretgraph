import { ApolloClient, useApolloClient } from '@apollo/client'
import Button from '@material-ui/core/Button'
import Chip from '@material-ui/core/Chip'
import Collapse from '@material-ui/core/Collapse'
import Divider from '@material-ui/core/Divider'
import Drawer from '@material-ui/core/Drawer'
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
import TreeItem from '@material-ui/lab/TreeItem'
import TreeView from '@material-ui/lab/TreeView'
import * as React from 'react'

import { mapHashNames } from '../../constants'
import * as Contexts from '../../contexts'
import * as Interfaces from '../../interfaces'
import { getClusterQuery } from '../../queries/cluster'
import { serverConfigQuery } from '../../queries/server'
import { useStylesAndTheme } from '../../theme'
import { extractAuthInfo } from '../../utils/config'
import { loadAndExtractClusterInfo } from '../../utils/operations'
import * as SetOps from '../../utils/set'
import { CapturingSuspense } from '../misc'
/**const SideBarClusters = React.lazy(() => import('./clusters'))
const SideBarContents = React.lazy(() => import('./contents'))
const SideBarNotifications = React.lazy(() => import('./notifications')) */
import SideBarClusters from './clusters'
import SideBarContents from './contents'
import SideBarHeader from './header'
import SideBarNotifications from './notifications'

async function title_helper({
    client,
    authorization,
    id,
    canceled,
    setName,
    setNote,
}: {
    client: ApolloClient<any>
    authorization: string[]
    id: string
    canceled: () => boolean
    setName: (arg: string) => void
    setNote: (arg: string) => void
}) {
    const { name, note } = await loadAndExtractClusterInfo({
        client,
        authorization,
        id,
    })
    if (canceled()) {
        return
    }
    name && setName(name)
    note && setNote(note)
}

const ActiveElements = ({
    setOpenMenu,
    ...props
}: {
    openMenu: string
    setOpenMenu: any
}) => {
    const { classes, theme } = useStylesAndTheme()
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx, updateSearchCtx } = React.useContext(Contexts.Search)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
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
            authorization: keys,
            id: searchCtx.cluster,
            setName: setClusterName,
            setNote: setClusterNote,
            canceled: () => finished == true,
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
                        deleted: false,
                        type: 'Cluster',
                        action: 'view',
                        title: '',
                    })
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
                        title: '',
                    })
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
                    primary={`Content: ${mainCtx.type}: ${
                        mainCtx.title || mainCtx.item
                    }`}
                />
            </ListItem>
        )
    }
    return <List>{...activeElements}</List>
}

const SideBarItems = ({
    setOpenMenu,
    ...props
}: {
    openMenu: string
    setOpenMenu: any
}) => {
    const { classes, theme } = useStylesAndTheme()
    const { config } = React.useContext(Contexts.InitializedConfig)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx, updateSearchCtx } = React.useContext(Contexts.Search)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const authinfo = React.useMemo(
        () => extractAuthInfo({ config, url: activeUrl }),
        [config, activeUrl]
    )

    return (
        <div className={classes.sideBarBody}>
            <CapturingSuspense>
                <SideBarNotifications
                    key="SideBarNotifications"
                    authinfo={authinfo}
                    header={'Notifications'}
                    className={
                        props.openMenu != 'notifications'
                            ? classes.hidden
                            : undefined
                    }
                />
                <SideBarClusters
                    key="SideBarClusters"
                    className={
                        props.openMenu != 'clusters'
                            ? classes.hidden
                            : undefined
                    }
                    authinfo={authinfo}
                    activeCluster={searchCtx.cluster}
                    header="Clusters"
                    selectItem={(cluster: any) => {
                        const url = new URL(activeUrl)
                        updateMainCtx({
                            item: cluster.id,
                            updateId: cluster.updateId,
                            type: 'Cluster',
                            deleted: false,
                            action: 'view',
                            url: activeUrl,
                            shareUrl: `${url.origin}${cluster.link}`,
                            title: '',
                        })
                        updateSearchCtx({
                            cluster: cluster.id,
                        })
                        setOpenMenu('contents')
                    }}
                />
                <SideBarContents
                    key="SideBarContentsPublic"
                    className={
                        props.openMenu != 'contents'
                            ? classes.hidden
                            : undefined
                    }
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
                            title: '',
                            type: type,
                            deleted: false,
                            item: content.id,
                            updateId: content.updateId,
                            url: activeUrl,
                            shareUrl: `${url.origin}${content.link}`,
                        })
                        setOpenMenu('notifications')
                    }}
                />
                <SideBarContents
                    key="SideBarContentsInternal"
                    className={
                        props.openMenu != 'contents'
                            ? classes.hidden
                            : undefined
                    }
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
                        const url = new URL(activeUrl)
                        updateMainCtx({
                            action: 'view',
                            title: '',
                            type: type,
                            deleted: false,
                            item: content.id,
                            updateId: content.updateId,
                            url: activeUrl,
                            shareUrl: `${url.origin}${content.link}`,
                        })
                        setOpenMenu('notifications')
                    }}
                />
            </CapturingSuspense>
        </div>
    )
}

export default function SideBar() {
    const { classes, theme } = useStylesAndTheme()
    const { config } = React.useContext(Contexts.Config)
    const { open } = React.useContext(Contexts.OpenSidebar)
    const { searchCtx, updateSearchCtx } = React.useContext(Contexts.Search)
    const [selected, setSelected] = React.useState<string[]>([])
    const [expanded, setExpanded] = React.useState<string[]>([])
    const [openMenu, setOpenMenu] = React.useState('notifications')
    let activeElements: any = null
    let sideBarItems: any = null
    if (config) {
        activeElements = (
            <ActiveElements openMenu={openMenu} setOpenMenu={setOpenMenu} />
        )

        sideBarItems = (
            <SideBarItems openMenu={openMenu} setOpenMenu={setOpenMenu} />
        )
    }
    return (
        <Drawer
            variant="persistent"
            anchor={theme.direction === 'ltr' ? 'left' : 'right'}
            open={!!(open && config)}
            classes={{
                paper: classes.drawerPaper,
            }}
        >
            <SideBarHeader />
            <Divider />
            <TreeView
                multiSelect
                selected={selected}
                expanded={expanded}
                onNodeToggle={(ev, items) => {
                    setExpanded(items)
                }}
                onNodeSelect={(ev, items) => {
                    setSelected(items.filter((val) => !expanded.includes(val)))
                }}
                defaultCollapseIcon={<ExpandMoreIcon />}
                defaultExpandIcon={<ChevronRightIcon />}
            ></TreeView>
            {activeElements}
            <Divider />
            {sideBarItems}
        </Drawer>
    )
}
