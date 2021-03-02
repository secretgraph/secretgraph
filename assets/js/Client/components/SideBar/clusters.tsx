import { useQuery } from '@apollo/client'
import Divider from '@material-ui/core/Divider'
import List, { ListProps } from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ListSubheader from '@material-ui/core/ListSubheader'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import GroupWorkIcon from '@material-ui/icons/GroupWork'
import * as React from 'react'

import { ActiveUrl } from '../../contexts'
import * as Interfaces from '../../interfaces'
import { clusterFeedQuery } from '../../queries/cluster'
import { useStylesAndTheme } from '../../theme'
import { extractPublicInfo } from '../../utils/cluster'

type SideBarItemsProps = {
    authinfo: Interfaces.AuthInfoInterface
    selectItem: any
    loadMoreExtra?: any
    activeCluster: string | null
    header?: string
}

export default function Clusters({
    authinfo,
    selectItem,
    activeCluster,
    header,
    loadMoreExtra,
    ...props
}: SideBarItemsProps & ListProps) {
    const { classes } = useStylesAndTheme()
    const { activeUrl } = React.useContext(ActiveUrl)

    let { data, fetchMore, error, loading } = useQuery(clusterFeedQuery, {
        variables: {
            authorization: authinfo.keys,
        },
    })

    const _loadMore = () => {
        fetchMore({
            variables: {
                cursor: data.clusters.clusters.pageInfo.endCursor,
            },
        }).then(() => {
            if (loadMoreExtra) {
                loadMoreExtra()
            }
        })
    }
    const clustersFinished: JSX.Element[] = React.useMemo(() => {
        if (!data) {
            return []
        }
        return data.clusters.clusters.edges.map((edge: any) => {
            const { name, note } = extractPublicInfo(edge.node.publicInfo)
            if (edge.node.id === activeCluster) {
                return (
                    <ListItem
                        button
                        key={`${activeUrl}:cluster:entry:${edge.node.id}`}
                        onClick={() => selectItem(edge.node)}
                    >
                        <ListItemIcon
                            key={`${activeUrl}:cluster:entry:${edge.node.id}.icon`}
                        >
                            <GroupWorkIcon />
                        </ListItemIcon>
                        <ListItemText
                            key={`${activeUrl}:cluster:entry:${edge.node.id}.text`}
                            className={classes.sideBarEntry}
                            primaryTypographyProps={{ variant: 'body2' }}
                            primary={
                                name ? name : `...${edge.node.id.substr(-48)}`
                            }
                            title={note || undefined}
                        />
                        {edge.node.id !== activeCluster ? (
                            <ExpandMoreIcon />
                        ) : null}
                    </ListItem>
                )
            } else {
                return (
                    <ListItem
                        button
                        key={`${activeUrl}:cluster:entry:${edge.node.id}`}
                        onClick={() => selectItem(edge.node)}
                    >
                        <ListItemIcon
                            key={`${activeUrl}:cluster:entry:${edge.node.id}.icon`}
                        >
                            <GroupWorkIcon />
                        </ListItemIcon>
                        <ListItemText
                            key={`${activeUrl}:cluster:entry:${edge.node.id}.text`}
                            className={classes.sideBarEntry}
                            primary={
                                name ? name : `...${edge.node.id.substr(-48)}`
                            }
                            title={note || undefined}
                        />
                    </ListItem>
                )
            }
        })
    }, [data])

    return (
        <List {...props}>
            {header && (
                <ListSubheader key="header" className={classes.sideBarEntry}>
                    {header}
                </ListSubheader>
            )}
            {clustersFinished}
            <Divider />
            <ListItem
                button
                key={`${activeUrl}:cluster:loadmore`}
                disabled={
                    loading ||
                    !!error ||
                    !data.clusters.clusters.pageInfo.hasNextPage
                }
                onClick={() => {
                    _loadMore()
                }}
            >
                <ListItemText
                    key={`${activeUrl}:cluster:loadmore.text`}
                    primary={'Load more clusters...'}
                />
            </ListItem>
        </List>
    )
}
