import { useLazyQuery } from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ReplayIcon from '@mui/icons-material/Replay'
import List, { ListProps } from '@mui/material/List'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { b64tobuffer, utf8decoder } from '@secretgraph/misc/utils/encoding'
import * as React from 'react'
import IconButton from '@mui/material/IconButton'

import * as Contexts from '../../contexts'
import SideBarContents from './contents'
import SidebarItemLabel from './SidebarItemLabel'
import Checkbox from '@mui/material/Checkbox'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'

export default React.memo(function ClusterItem({
    node,
    authinfoCluster,
}: {
    node: any
    authinfoCluster?: Interfaces.AuthInfoInterface
}) {
    const [expanded, setExpanded] = React.useState(false)
    const { mainCtx, goToNode } = React.useContext(Contexts.Main)
    const { config } = React.useContext(Contexts.Config)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { selected, setSelected, selectionMode } = React.useContext(
        Contexts.SidebarItemsSelected
    )
    const authinfoContent = React.useMemo(
        () =>
            config
                ? authInfoFromConfig({
                      config,
                      url: activeUrl,
                      clusters: new Set([node.id]),
                  })
                : undefined,
        [config, activeUrl, node.id]
    )
    // TODO: check availability of extra cluster permissions. Merge authInfos
    // for now assume yes if manage type was not specified
    const selectable =
        !authinfoCluster ||
        !authinfoCluster.types.has('manage') ||
        (
            node.availableActions as {
                type: string
            }[]
        ).some((val) => val.type == 'delete' || val.type == 'manage')
    let nodeRawId = node.id
    if (nodeRawId) {
        try {
            const rawTxt = utf8decoder.decode(b64tobuffer(nodeRawId))
            let [_, tmp] = rawTxt.match(/:(.*)/) as string[]
            nodeRawId = tmp
        } catch (exc) {
            nodeRawId = `...${node.id.slice(-48)}`
        }
    }
    let name = node.name
    if (!name) {
        name = nodeRawId
    }
    let marked = false
    if (node.__typename == 'Cluster') {
        marked = node.id == mainCtx.item
    } else if (node.cluster && node.cluster.id) {
        marked = node.cluster.id == mainCtx.currentCluster
    }
    return (
        <React.Fragment key={node.id}>
            <SidebarItemLabel
                title={name != nodeRawId ? nodeRawId : undefined}
                deleted={node.deleted}
                listItemButtonProps={{
                    onDoubleClick: (ev: any) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        node && goToNode({ ...node, title: name })
                    },
                    disableRipple: true,
                }}
                listItemTextProps={{
                    secondary: node.description,
                    primaryTypographyProps: {},
                }}
                rightOfLabel={
                    <ListItemSecondaryAction>
                        <Checkbox
                            sx={{
                                display:
                                    selectionMode == 'none'
                                        ? 'none'
                                        : undefined,
                            }}
                            disabled={!selectable}
                            onChange={(ev) => {
                                ev.preventDefault()
                                ev.stopPropagation()
                                const index = selected.indexOf(node.id)
                                let newSelected
                                if (index === -1) {
                                    newSelected = [...selected, node.id]
                                } else {
                                    newSelected = selected.toSpliced(index, 1)
                                }
                                setSelected(newSelected)
                            }}
                            checked={selected.indexOf(node.id) !== -1}
                        />
                        <IconButton
                            edge="end"
                            onClick={(ev: any) => {
                                ev.preventDefault()
                                ev.stopPropagation()
                                setExpanded(!expanded)
                            }}
                        >
                            {expanded ? (
                                <ExpandMoreIcon
                                    fontSize="small"
                                    style={{ marginLeft: '4px' }}
                                />
                            ) : (
                                <ExpandLessIcon
                                    fontSize="small"
                                    style={{ marginLeft: '4px' }}
                                />
                            )}
                        </IconButton>
                    </ListItemSecondaryAction>
                }
                primary={name}
            />

            {expanded ? (
                <List
                    component="div"
                    disablePadding
                    dense
                    sx={{ pl: 1, pr: 1 }}
                >
                    <SideBarContents
                        clusters={[node.id]}
                        authinfoContent={authinfoContent}
                        deleted={node.deleted}
                        label="Private"
                        public={Constants.UseCriteriaPublic.FALSE}
                    />
                    <SideBarContents
                        clusters={[node.id]}
                        authinfoContent={authinfoContent}
                        deleted={node.deleted}
                        public={Constants.UseCriteriaPublic.TRUE}
                        label="Public"
                    />
                </List>
            ) : null}
        </React.Fragment>
    )
})
