import * as React from 'react'
import Divider from '@material-ui/core/Divider'
import GroupWorkIcon from '@material-ui/icons/GroupWork'
import { parse, graph, SPARQLToQuery } from 'rdflib'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ListSubheader from '@material-ui/core/ListSubheader'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import { useQuery } from '@apollo/client'
import { clusterFeedQuery } from '../../queries/cluster'
import { extractPublicInfo } from '../../utils/cluster'
import { useStylesAndTheme } from '../../theme'
import { ActiveUrlContext } from '../../contexts'
import { AuthInfoInterface } from '../../interfaces'

type SideBarItemsProps = {
    authinfo: AuthInfoInterface
    selectItem: any
    loadMoreExtra?: any
    activeCluster: string | null
    header?: string
}

export default function Clusters(appProps: SideBarItemsProps) {
    const { classes } = useStylesAndTheme()
    const {
        authinfo,
        selectItem,
        activeCluster,
        header,
        loadMoreExtra,
    } = appProps
    const { activeUrl } = React.useContext(ActiveUrlContext)

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

    let _header = null
    if (header) {
        _header = (
            <ListSubheader key="header" className={classes.sideBarEntry}>
                {header}
            </ListSubheader>
        )
    }
    const clustersFinished: () => JSX.Element[] = React.useCallback(() => {
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
        <List>
            {_header}
            {clustersFinished()}
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
