import { ApolloClient, useApolloClient } from '@apollo/client'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import { useTheme } from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Autocomplete from '@mui/material/Autocomplete'
import TreeItem from '@mui/lab/TreeItem'
import TreeView from '@mui/lab/TreeView'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { extractAuthInfo } from '@secretgraph/misc/utils/config'
import * as SetOps from '@secretgraph/misc/utils/set'
import * as React from 'react'

import * as Contexts from '../../contexts'
import { CapturingSuspense } from '../misc'
/**const SideBarClusters = React.lazy(() => import('./clusters'))
const SideBarContents = React.lazy(() => import('./contents'))
const SideBarNotifications = React.lazy(() => import('./notifications')) */
import SideBarClusters from './clusters'
import SideBarContents from './contents'
import SideBarHeader from './header'
import SideBarNotifications from './notifications'

const SideBarItems = () => {
    const theme = useTheme()
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx, updateSearchCtx } = React.useContext(Contexts.Search)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const authinfo = React.useMemo(
        () => (config ? extractAuthInfo({ config, url: activeUrl }) : null),
        [config, activeUrl]
    )

    const tokens = React.useMemo(() => {
        return [...(authinfo?.tokens || []), ...(mainCtx.tokens || [])]
    }, [authinfo, mainCtx.tokens])
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
        const tokens = config
            ? extractAuthInfo({
                  config,
                  url: activeUrl,
              }).tokens
            : []

        updateMainCtx({
            item: node.id,
            updateId: node.updateId,
            type,
            deleted: false,
            action: 'view',
            url: activeUrl,
            shareUrl: `${activeUrlAsURL.origin}${node.link}`,
            title: node.title || '',
            tokens,
            tokenPermissions: new Set(['view']),
        })
        if (type == 'Cluster') {
            updateSearchCtx({
                cluster: node.id,
            })
        }
    }

    return (
        <>
            <TreeItem
                nodeId="clusters"
                label="Clusters"
                classes={{ label: theme.classes.treeItemHeading }}
                style={{ color: searchCtx.deleted ? 'red' : undefined }}
            >
                {authinfo && (
                    <SideBarClusters
                        classes={{ label: theme.classes.treeItemHeading }}
                        nodeId="clusters-owned"
                        label="Owned"
                        tokens={tokens}
                        deleted={searchCtx.deleted}
                        activeCluster={searchCtx.cluster}
                        goTo={goTo}
                    />
                )}
                <SideBarClusters
                    classes={{ label: theme.classes.treeItemHeading }}
                    nodeId="clusters-public"
                    label="Public"
                    deleted={searchCtx.deleted}
                    goTo={goTo}
                />
            </TreeItem>
            <TreeItem
                nodeId="contents"
                label="Contents"
                classes={{ label: theme.classes.treeItemHeading }}
                style={{ color: searchCtx.deleted ? 'red' : undefined }}
            >
                <SideBarContents
                    key="SideBarContentsPublic"
                    nodeId="contents-public"
                    activeContent={mainCtx.item}
                    usePublic
                    deleted={searchCtx.deleted}
                    label="Public"
                    classes={{ label: theme.classes.treeItemHeading }}
                    goTo={goTo}
                />
                {authinfo && (
                    <>
                        <SideBarContents
                            key="SideBarContentsDraft"
                            nodeId="contents-drafts"
                            authinfo={authinfo}
                            deleted={searchCtx.deleted}
                            activeContent={mainCtx.item}
                            injectInclude={['state=draft']}
                            label="Drafts"
                            classes={{ label: theme.classes.treeItemHeading }}
                            goTo={goTo}
                        />
                        <SideBarContents
                            key="SideBarContentsInternal"
                            nodeId="contents-internal"
                            authinfo={authinfo}
                            deleted={searchCtx.deleted}
                            activeContent={mainCtx.item}
                            injectInclude={['state=internal']}
                            label="Internal"
                            classes={{ label: theme.classes.treeItemHeading }}
                            goTo={goTo}
                        />
                    </>
                )}
            </TreeItem>
        </>
    )
}

export default React.memo(function SideBar() {
    const theme = useTheme()
    const { config } = React.useContext(Contexts.Config)
    const { open } = React.useContext(Contexts.OpenSidebar)
    const { searchCtx } = React.useContext(Contexts.Search)
    const [itemsToggle, notifyItems] = React.useReducer(
        (state) => !state,
        false
    )
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
                        paper: theme.classes.drawerPaper,
                    }}
                    style={{
                        display: !(open && config) ? 'hidden' : undefined,
                    }}
                >
                    <SideBarHeader notifyItems={notifyItems} />
                    <Divider />
                    <CapturingSuspense>
                        <TreeView
                            multiSelect
                            selected={selected}
                            expanded={expanded}
                            onNodeToggle={(ev, items) => {
                                setExpanded(items)
                            }}
                            onNodeSelect={(ev, items) => {
                                setSelected(
                                    items.filter(
                                        (val) =>
                                            val.includes('::') ||
                                            (config &&
                                                val == config.configCluster)
                                    )
                                )
                            }}
                            defaultCollapseIcon={<ExpandMoreIcon />}
                            defaultExpandIcon={<ChevronRightIcon />}
                            key={`${searchCtx.deleted}-${itemsToggle}`}
                        >
                            <SideBarItems />
                        </TreeView>
                    </CapturingSuspense>
                </Drawer>
            </Contexts.SidebarItemsExpanded.Provider>
        </Contexts.SidebarItemsSelected.Provider>
    )
})
