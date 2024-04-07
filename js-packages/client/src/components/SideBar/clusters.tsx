import { useLazyQuery } from '@apollo/client'
import IconButton from '@mui/material/IconButton'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ReplayIcon from '@mui/icons-material/Replay'
import List from '@mui/material/List'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

import * as Contexts from '../../contexts'
import SidebarItemLabel from './SidebarItemLabel'
import ClusterItem from './ClusterItem'
import { ListItemButton, ListItemText } from '@mui/material'

type SideBarItemsProps = {
    authinfoCluster?: Interfaces.AuthInfoInterface
    authinfoContent?: Interfaces.AuthInfoInterface
    excludeIds?: string[]
    title?: string
    deleted?: boolean
    label: string
    nodeid?: string
}

export default React.memo(function Clusters({
    authinfoCluster,
    authinfoContent,
    excludeIds,
    title,
    deleted,
    label,
    nodeid,
}: SideBarItemsProps) {
    const { searchCtx } = React.useContext(Contexts.Search)
    const [expanded, setExpanded] = React.useState(false)
    const { mainCtx } = React.useContext(Contexts.Main)
    let [loadQuery, { data, fetchMore, error, loading, refetch, called }] =
        useLazyQuery(clusterFeedQuery, {
            variables: {
                authorization: authinfoCluster?.tokens,
                public:
                    !authinfoCluster?.tokens || !authinfoCluster.tokens.length
                        ? Constants.UseCriteriaPublic.TRUE
                        : Constants.UseCriteriaPublic.FALSE,
                deleted: searchCtx.deleted
                    ? Constants.UseCriteria.TRUE
                    : Constants.UseCriteria.FALSE,
                excludeIds: excludeIds,
            },
            nextFetchPolicy: 'cache-and-network',
        })
    React.useEffect(() => {
        expanded && loadQuery()
    }, [expanded])

    const _loadMore = () => {
        fetchMore &&
            fetchMore({
                variables: {
                    cursor: data.clusters.clusters.pageInfo.endCursor,
                },
            })
    }
    const clustersHalfFinished: (JSX.Element | null)[] = React.useMemo(() => {
        if (!data) {
            return [null]
        }
        const ret: JSX.Element[] = []
        for (const { node } of data.clusters.clusters.edges) {
            ret.push(
                <ClusterItem
                    key={node.id}
                    node={node}
                    authinfoCluster={authinfoCluster}
                    authinfoContent={authinfoContent}
                />
            )
        }
        return ret
    }, [data])
    /*
                disabled={
                    loading ||
                    !!error ||
                    !data.clusters.clusters.pageInfo.hasNextPage
                }*/
    const clustersFinished = [...clustersHalfFinished]

    if (
        !loading &&
        !error &&
        data &&
        data.clusters.clusters.pageInfo.hasNextPage
    ) {
        clustersFinished.push(
            <ListItemButton
                key="cluster-loadmore"
                dense
                onClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    _loadMore()
                }}
            >
                <ListItemText>Load more clusters...</ListItemText>
            </ListItemButton>
        )
    }

    return (
        <>
            <SidebarItemLabel
                title={title}
                deleted={deleted}
                listItemButtonProps={{
                    dense: true,
                    selected: mainCtx.item == nodeid,
                    disableRipple: true,
                }}
                primary={label}
                rightOfLabel={
                    <ListItemSecondaryAction>
                        {loading || !called || !expanded ? null : (
                            <IconButton
                                onClick={(ev) => {
                                    ev.preventDefault()
                                    ev.stopPropagation()
                                    refetch && refetch()
                                }}
                            >
                                <ReplayIcon
                                    fontSize="small"
                                    style={{ marginLeft: '4px' }}
                                />
                            </IconButton>
                        )}
                        <IconButton
                            edge="end"
                            onClick={(ev) => {
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
            />

            {expanded ? (
                <List
                    component="div"
                    disablePadding
                    dense
                    sx={{ pl: 1, pr: 1 }}
                >
                    {clustersFinished}
                </List>
            ) : null}
        </>
    )
})
