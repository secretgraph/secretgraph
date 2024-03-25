import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import { useTheme } from '@mui/material/styles'
import { TreeItem } from '@mui/x-tree-view/TreeItem'
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView'
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
    const { searchCtx } = React.useContext(Contexts.Search)
    const { mainCtx, goToNode } = React.useContext(Contexts.Main)
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

    return (
        <>
            <TreeItem
                itemId="clusters"
                label={
                    <SidebarTreeItemLabel heading deleted={searchCtx.deleted}>
                        Clusters
                    </SidebarTreeItemLabel>
                }
            >
                {authinfoCluster && (
                    <SideBarClusters
                        heading
                        itemId={`${activeUrl}-clusters-nonpublic`}
                        label="Non-Public"
                        authinfo={authinfoCluster}
                        deleted={searchCtx.deleted}
                        goTo={goToNode}
                    />
                )}
                <SideBarClusters
                    heading
                    itemId={`${activeUrl}-clusters-public`}
                    label="Public"
                    deleted={searchCtx.deleted}
                    goTo={goToNode}
                />
            </TreeItem>
            <TreeItem
                itemId="contents"
                label={
                    <SidebarTreeItemLabel heading deleted={searchCtx.deleted}>
                        Contents
                    </SidebarTreeItemLabel>
                }
            >
                <SideBarContents
                    key="SideBarContentsPublic"
                    itemId={`${activeUrl}-contents-public`}
                    activeContent={mainCtx.item}
                    public={Constants.UseCriteriaPublic.TRUE}
                    deleted={searchCtx.deleted}
                    label="Public"
                    heading
                    goTo={goToNode}
                />
                {authinfo && (
                    <>
                        <SideBarContents
                            key="SideBarContentsDraft"
                            itemId={`${activeUrl}-contents-drafts`}
                            authinfo={authinfo}
                            deleted={searchCtx.deleted}
                            activeContent={mainCtx.item}
                            states={['draft']}
                            label="Drafts"
                            heading
                            goTo={goToNode}
                        />
                        <SideBarContents
                            key="SideBarContentsPrivate"
                            itemId={`${activeUrl}-contents-private`}
                            authinfo={authinfo}
                            deleted={searchCtx.deleted}
                            activeContent={mainCtx.item}
                            states={['protected']}
                            label="Private"
                            heading
                            goTo={goToNode}
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
                        <SimpleTreeView
                            multiSelect
                            selectedItems={selected}
                            expandedItems={expanded}
                            onExpandedItemsChange={(ev, items) => {
                                setExpanded(items)
                            }}
                            onSelectedItemsChange={(ev, items) => {
                                setSelected(
                                    items.filter((val) => val.includes('::'))
                                )
                            }}
                            slots={{
                                collapseIcon: ExpandMoreIcon,
                                expandIcon: ChevronRightIcon,
                            }}
                            key={`${searchCtx.deleted}-${itemsToggle}`}
                        >
                            <SideBarItems />
                        </SimpleTreeView>
                    </CapturingSuspense>
                </Drawer>
            </Contexts.SidebarItemsExpanded.Provider>
        </Contexts.SidebarItemsSelected.Provider>
    )
})
