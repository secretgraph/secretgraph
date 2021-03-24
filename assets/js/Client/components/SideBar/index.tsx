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

    const activeElements = []
    if (searchCtx.cluster) {
        const inner = (
            <TreeItem
                nodeId={`active::${searchCtx.cluster}`}
                key="clusters:show:known.text"
                label={clusterName}
                onDoubleClick={() => {
                    updateMainCtx({
                        item: searchCtx.cluster,
                        url: activeUrl,
                        deleted: false,
                        type: 'Cluster',
                        action: 'view',
                        title: '',
                    })
                }}
            />
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
    }
    if (mainCtx.item && mainCtx.type != 'Cluster') {
        activeElements.push(
            <TreeItem
                key="content:show.text"
                className={classes.sideBarEntry}
                nodeId={`active::${mainCtx.item}`}
                label={`${mainCtx.type}: ${mainCtx.title || mainCtx.item}`}
                onDoubleClick={() => {
                    updateMainCtx({
                        item: mainCtx.item,
                        url: activeUrl,
                        deleted: false,
                        type: mainCtx.type,
                        action: 'view',
                        title: '',
                    })
                }}
            />
        )
    }
    return <>{activeElements}</>
}

const SideBarItems = () => {
    const { classes, theme } = useStylesAndTheme()
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx, updateSearchCtx } = React.useContext(Contexts.Search)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const authinfo = React.useMemo(
        () => (config ? extractAuthInfo({ config, url: activeUrl }) : null),
        [config, activeUrl]
    )
    const activeUrlAsURL = new URL(activeUrl, window.location.href)
    const goTo = (node: any) => {
        let type =
            node.__typename == 'Cluster'
                ? 'Cluster'
                : node.tags.find((flag: string) => flag.startsWith('type='))
        if (type && type != 'Cluster') {
            // split works different in js, so 2
            type = type.match(/=(.*)/)[1]
        }
        if (type == 'PrivateKey') {
            type = 'PublicKey'
        }
        updateMainCtx({
            item: node.id,
            updateId: node.updateId,
            type,
            deleted: false,
            action: 'view',
            url: activeUrl,
            shareUrl: `${activeUrlAsURL.origin}${node.link}`,
            title: '',
        })
        if (type == 'Cluster') {
            updateSearchCtx({
                cluster: node.id,
            })
        }
    }

    return (
        <>
            {authinfo && (
                <CapturingSuspense>
                    <SideBarClusters
                        key="SideBarClusters"
                        nodeId="clusters"
                        authinfo={authinfo}
                        activeCluster={searchCtx.cluster}
                        goTo={goTo}
                    />
                </CapturingSuspense>
            )}
            <CapturingSuspense>
                <SideBarContents
                    key="SideBarContentsPublic"
                    nodeId="contents-public"
                    activeContent={mainCtx.item}
                    usePublic
                    label="Public"
                    goTo={goTo}
                />
            </CapturingSuspense>
            {authinfo && (
                <CapturingSuspense>
                    <SideBarContents
                        key="SideBarContentsInternal"
                        nodeId="contents-internal"
                        authinfo={authinfo}
                        activeContent={mainCtx.item}
                        state="internal"
                        label="Internal"
                        goTo={goTo}
                    />
                </CapturingSuspense>
            )}
        </>
    )
}

export default function SideBar() {
    const { classes, theme } = useStylesAndTheme()
    const { config } = React.useContext(Contexts.Config)
    const { open } = React.useContext(Contexts.OpenSidebar)
    const [selected, setSelected] = React.useState<string[]>([])
    const [expanded, setExpanded] = React.useState<string[]>([])
    /**let activeElements: any = null
    if (config) {
        activeElements = (
            <ActiveElements openMenu={openMenu} setOpenMenu={setOpenMenu} />
        )
    }*/
    return (
        <Contexts.SidebarItemsSelected.Provider
            value={{ selected, setSelected }}
        >
            <Contexts.SidebarItemsExpanded.Provider
                value={{ expanded, setExpanded }}
            >
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
                            setExpanded(
                                items.filter((val) => val.includes('::'))
                            )
                        }}
                        onNodeSelect={(ev, items) => {
                            setSelected(
                                items.filter(
                                    (val) =>
                                        val.includes('::') &&
                                        !expanded.includes(val)
                                )
                            )
                        }}
                        defaultCollapseIcon={<ExpandMoreIcon />}
                        defaultExpandIcon={<ChevronRightIcon />}
                    >
                        <SideBarItems />
                    </TreeView>
                </Drawer>
            </Contexts.SidebarItemsExpanded.Provider>
        </Contexts.SidebarItemsSelected.Provider>
    )
}
