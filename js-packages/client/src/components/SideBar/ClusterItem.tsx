import { useLazyQuery } from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ReplayIcon from '@mui/icons-material/Replay'
import List, { ListProps } from '@mui/material/List'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { b64tobuffer, utf8decoder } from '@secretgraph/misc/utils/encoding'
import * as React from 'react'

import * as Contexts from '../../contexts'
import SideBarContents from './contents'
import SidebarItemLabel from './SidebarItemLabel'
import Button from '@mui/material/Button'

export default React.memo(function ClusterItem({
    node,
    authinfo,
    deleted,
}: {
    node: any
    authinfo?: Interfaces.AuthInfoInterface
    deleted?: boolean
}) {
    const [expanded, setExpanded] = React.useState(false)
    const { mainCtx, goToNode } = React.useContext(Contexts.Main)
    // TODO: check availability of extra cluster permissions. Merge authInfos
    // for now assume yes if manage type was not specified
    const deleteable =
        !authinfo ||
        !authinfo.types.has('manage') ||
        (
            node.availableActions as {
                type: string
            }[]
        ).some((val) => val.type == 'delete' || val.type == 'manage')
    let name = node.name
    if (!name) {
        name = node.id
        if (name) {
            try {
                const rawTxt = utf8decoder.decode(b64tobuffer(name))
                let [_, tmp] = rawTxt.match(/:(.*)/) as string[]
                name = tmp
            } catch (exc) {
                name = `...${node.id.slice(-48)}`
            }
        }
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
                title={node.description}
                deleted={deleted}
                listItemButtonProps={{
                    onClick: (ev: any) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        node && goToNode({ ...node, title: name })
                    },
                }}
                rightOfLabel={
                    <Button
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
                    </Button>
                }
                label={name}
            />

            {expanded ? (
                <List
                    component="div"
                    disablePadding
                    dense
                    sx={{ pl: 1, pr: 2 }}
                >
                    <SideBarContents
                        cluster={node.id}
                        authinfo={authinfo}
                        deleted={node.deleted}
                        public={Constants.UseCriteriaPublic.TRUE}
                        label="Public"
                    />
                    <SideBarContents
                        cluster={node.id}
                        authinfo={authinfo}
                        deleted={node.deleted}
                        label="Private"
                        public={Constants.UseCriteriaPublic.FALSE}
                    />
                </List>
            ) : null}
        </React.Fragment>
    )
})
