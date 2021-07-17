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
import { useTheme } from '@material-ui/core/styles'
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
import { extractAuthInfo } from '../../utils/config'
import * as SetOps from '../../utils/set'
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
            {authinfo && (
                <SideBarClusters
                    sys={{ label: theme.classes.treeItemHeading }}
                    key="SideBarClusters"
                    nodeId="clusters"
                    label="Clusters"
                    authinfo={authinfo}
                    activeCluster={searchCtx.cluster}
                    goTo={goTo}
                />
            )}
            <TreeItem
                nodeId="contents"
                label="Contents"
                classes={{ label: classes.treeItemHeading }}
            >
                <SideBarContents
                    key="SideBarContentsPublic"
                    nodeId="contents-public"
                    activeContent={mainCtx.item}
                    usePublic
                    label="Public"
                    classes={{ label: classes.treeItemHeading }}
                    goTo={goTo}
                />
                {authinfo && (
                    <>
                        <SideBarContents
                            key="SideBarContentsDraft"
                            nodeId="contents-drafts"
                            authinfo={authinfo}
                            activeContent={mainCtx.item}
                            injectInclude={['state=draft']}
                            label="Drafts"
                            classes={{ label: classes.treeItemHeading }}
                            goTo={goTo}
                        />
                        <SideBarContents
                            key="SideBarContentsInternal"
                            nodeId="contents-internal"
                            authinfo={authinfo}
                            activeContent={mainCtx.item}
                            injectInclude={['state=internal']}
                            label="Internal"
                            classes={{ label: classes.treeItemHeading }}
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
                        paper: !!(open && config)
                            ? classes.drawerPaper
                            : classes.hidden,
                    }}
                >
                    <SideBarHeader />
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
                                    items.filter((val) => val.includes('::'))
                                )
                            }}
                            defaultCollapseIcon={<ExpandMoreIcon />}
                            defaultExpandIcon={<ChevronRightIcon />}
                        >
                            <SideBarItems />
                        </TreeView>
                    </CapturingSuspense>
                </Drawer>
            </Contexts.SidebarItemsExpanded.Provider>
        </Contexts.SidebarItemsSelected.Provider>
    )
})
