import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import { useTheme } from '@mui/material/styles'
import ListItem from '@mui/material/ListItem'
import List from '@mui/material/List'
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
import SidebarItemLabel from './SidebarItemLabel'

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
        <List>
            <ListItem>
                <SidebarItemLabel heading deleted={searchCtx.deleted}>
                    Clusters
                </SidebarItemLabel>
                <List>
                    {authinfoCluster && (
                        <SideBarClusters
                            heading
                            label="Non-Public"
                            authinfo={authinfoCluster}
                            deleted={searchCtx.deleted}
                            goTo={goToNode}
                        />
                    )}
                    <SideBarClusters
                        heading
                        label="Public"
                        deleted={searchCtx.deleted}
                        goTo={goToNode}
                    />
                </List>
            </ListItem>
        </List>
    )
}

export default function SideBar() {
    const theme = useTheme()
    const { config } = React.useContext(Contexts.Config)
    const { open } = React.useContext(Contexts.OpenSidebar)
    const { searchCtx } = React.useContext(Contexts.Search)
    const [itemsToggle, notifyItems] = React.useReducer(
        (state) => !state,
        false
    )
    const [selected, setSelected] = React.useState<string[]>([])
    console.log('selected', selected)
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
                    <SideBarItems />
                </CapturingSuspense>
            </Drawer>
        </Contexts.SidebarItemsSelected.Provider>
    )
}
