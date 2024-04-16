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
import * as Interfaces from '@secretgraph/misc/interfaces'
import { drawerWidth } from '../../theme'
/**const SideBarClusters = React.lazy(() => import('./clusters'))
const SideBarContents = React.lazy(() => import('./contents'))
const SideBarNotifications = React.lazy(() => import('./notifications')) */
import SideBarClusters from './clusters'
import SideBarContents from './contents'
import SideBarHeader from './header'
import SidebarItemLabel from './SidebarItemLabel'
import { ListSubheader } from '@mui/material'

const SideBarItems = () => {
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { mainCtx } = React.useContext(Contexts.Main)
    const authinfoCluster = React.useMemo(
        () =>
            config
                ? authInfoFromConfig({
                      config,
                      url: activeUrl,
                  })
                : undefined,
        [config, activeUrl]
    )

    return (
        <List
            component="div"
            disablePadding
            dense
            subheader={<ListSubheader component="div">Clusters</ListSubheader>}
        >
            {authinfoCluster && (
                <SideBarClusters
                    label="Non-Public"
                    authinfoCluster={authinfoCluster}
                    public={Constants.UseCriteriaPublic.FALSE}
                />
            )}
            <SideBarClusters
                label="Public"
                public={Constants.UseCriteriaPublic.TRUE}
            />
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
    const [selectionMode, setSelectionMode] = React.useState<
        'none' | 'delete'
    >('none')
    console.log('selected', selected)
    /**let activeElements: any = null
    if (config) {
        activeElements = (
            <ActiveElements openMenu={openMenu} setOpenMenu={setOpenMenu} />
        )
    }*/
    return (
        <Contexts.SidebarItemsSelected.Provider
            value={{ selected, setSelected, selectionMode, setSelectionMode }}
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
