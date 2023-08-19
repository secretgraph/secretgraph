import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import { useTheme } from '@mui/material/styles'
import { TreeItem } from '@mui/x-tree-view/TreeItem'
import { TreeView } from '@mui/x-tree-view/TreeView'
import * as Constants from '@secretgraph/misc/constants'
import { Writeable } from '@secretgraph/misc/typing'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import { CapturingSuspense } from '@secretgraph/ui-components/misc'
import * as React from 'react'

import * as Contexts from '../../contexts'
import { drawerWidth } from '../../theme'
/**const SideBarClusters = React.lazy(() => import('./clusters'))
const SideBarContents = React.lazy(() => import('./contents'))
const SideBarNotifications = React.lazy(() => import('./notifications')) */
import SideBarClusters from './clusters'
import SideBarContents from './contents'
import SideBarHeader from './header'
import SidebarTreeItemLabel from './SidebarTreeItemLabel'

const SideBarItems = () => {
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx, updateSearchCtx } = React.useContext(Contexts.Search)
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const authinfoCluster = React.useMemo(
        () =>
            config
                ? authInfoFromConfig({
                      config,
                      url: activeUrl,
                      clusters: searchCtx.cluster
                          ? new Set([searchCtx.cluster])
                          : undefined,
                  })
                : undefined,
        [config, activeUrl, searchCtx.cluster]
    )
    const authinfo = React.useMemo(
        () =>
            config
                ? authInfoFromConfig({
                      config,
                      url: activeUrl,
                      excludeClusters: searchCtx.cluster
                          ? new Set([searchCtx.cluster])
                          : undefined,
                  })
                : undefined,
        [config, activeUrl, searchCtx.cluster]
    )

    const activeUrlAsURL = new URL(activeUrl, window.location.href).href
    const goTo = (node: any) => {
        let type = node.__typename == 'Cluster' ? 'Cluster' : node.type
        if (type == 'PrivateKey') {
            type = 'PublicKey'
        }
        let tokens: string[] = []
        let tokensPermissions: Set<string> = new Set()
        if (config) {
            const retrieveOptions: Writeable<
                Parameters<typeof authInfoFromConfig>[0]
            > = {
                config,
                url: activeUrlAsURL,
            }
            if (type == 'Cluster') {
                if (node?.id) {
                    retrieveOptions['clusters'] = new Set([node.id])
                }
            } else if (node?.cluster?.id) {
                retrieveOptions['clusters'] = new Set([node.cluster.id])
                retrieveOptions['contents'] = new Set([node.id])
            }
            const res = authInfoFromConfig(retrieveOptions)
            tokens = res.tokens
            tokensPermissions = res.types
        }
        let name = ''
        if (type == 'Cluster') {
            name = node.name
        } else {
            for (const tag of node.tags) {
                if (tag.startsWith('name=')) {
                    name = tag.match(/=(.*)/)[1]
                    break
                }
            }
        }

        updateMainCtx({
            item: node.id,
            securityLevel: null,
            securityWarningArmed: true,
            readonly: true,
            currentCluster:
                type == 'Cluster' ? node.id : node?.cluster?.id || null,
            editCluster:
                type == 'Cluster' ? node.id : node?.cluster?.id || null,
            updateId: node.updateId,
            type,
            deleted: false,
            action: 'view',
            url: activeUrl,
            shareFn: null,
            openDialog: null,
            title: mainCtx.updateId == node.updateId ? undefined : name,
            tokens,
            tokensPermissions,
            cloneData: null,
        })
    }

    return (
        <>
            <TreeItem
                nodeId="clusters"
                label={
                    <SidebarTreeItemLabel heading deleted={searchCtx.deleted}>
                        Clusters
                    </SidebarTreeItemLabel>
                }
            >
                {authinfoCluster && (
                    <SideBarClusters
                        heading
                        nodeId={`${activeUrl}-clusters-nonpublic`}
                        label="Non-Public"
                        authinfo={authinfoCluster}
                        deleted={searchCtx.deleted}
                        goTo={goTo}
                    />
                )}
                <SideBarClusters
                    heading
                    nodeId={`${activeUrl}-clusters-public`}
                    label="Public"
                    deleted={searchCtx.deleted}
                    goTo={goTo}
                />
            </TreeItem>
            <TreeItem
                nodeId="contents"
                label={
                    <SidebarTreeItemLabel heading deleted={searchCtx.deleted}>
                        Contents
                    </SidebarTreeItemLabel>
                }
            >
                <SideBarContents
                    key="SideBarContentsPublic"
                    nodeId={`${activeUrl}-contents-public`}
                    activeContent={mainCtx.item}
                    public={Constants.UseCriteriaPublic.TRUE}
                    deleted={searchCtx.deleted}
                    label="Public"
                    heading
                    goTo={goTo}
                />
                {authinfo && (
                    <>
                        <SideBarContents
                            key="SideBarContentsDraft"
                            nodeId={`${activeUrl}-contents-drafts`}
                            authinfo={authinfo}
                            deleted={searchCtx.deleted}
                            activeContent={mainCtx.item}
                            states={['draft']}
                            label="Drafts"
                            heading
                            goTo={goTo}
                        />
                        <SideBarContents
                            key="SideBarContentsPrivate"
                            nodeId={`${activeUrl}-contents-private`}
                            authinfo={authinfo}
                            deleted={searchCtx.deleted}
                            activeContent={mainCtx.item}
                            states={['protected']}
                            label="Private"
                            heading
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
                    sx={{
                        display: !(open && config) ? 'none' : undefined,
                        '& .MuiDrawer-paper': {
                            width: drawerWidth,
                            overflowY: 'auto' as const,
                        },
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
                                    items.filter((val) => val.includes('::'))
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
