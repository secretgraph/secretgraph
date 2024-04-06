import { useLazyQuery } from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import Button from '@mui/material/Button'
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
import ListItem, { ListItemProps } from '@mui/material/ListItem'
import ClusterItem from './ClusterItem'
import { ListItemButton, ListItemText } from '@mui/material'

type SideBarItemsProps = {
    authinfo?: Interfaces.AuthInfoInterface
    excludeIds?: string[]
    title?: string
    deleted?: boolean
    label: string
    nodeid?: string
}

export default React.memo(function Clusters({
    authinfo,
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
                authorization: authinfo?.tokens,
                public:
                    !authinfo?.tokens || !authinfo.tokens.length
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
                    deleted={node.deleted}
                    authinfo={authinfo}
                />
            )
        }
        return ret
    }, [data, mainCtx.type == 'Cluster' ? mainCtx.item : ''])
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
                listItemProps={{
                    dense: true,
                    selected: mainCtx.item == nodeid,
                }}
                label={label}
                rightOfLabel={
                    <span>
                        {loading || !called || !expanded ? null : (
                            <span
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
                            </span>
                        )}
                        <Button
                            onClick={(ev) => {
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
                    </span>
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
