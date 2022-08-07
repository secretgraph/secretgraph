import {
    ApolloClient,
    useApolloClient,
    useLazyQuery,
    useQuery,
} from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ReplayIcon from '@mui/icons-material/Replay'
import TreeItem, { TreeItemProps } from '@mui/lab/TreeItem'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

import * as Contexts from '../../contexts'
import SideBarContents from './contents'
import SidebarTreeItemLabel from './SidebarTreeItemLabel'

type SideBarItemsProps =
    | {
          authinfo: Interfaces.AuthInfoInterface
          goTo: (node: any) => void
          excludeIds: string[]
          title?: string
          deleted?: boolean
          heading?: boolean
          icon?: React.ReactNode
      }
    | {
          authinfo?: Interfaces.AuthInfoInterface
          goTo: (node: any) => void
          excludeIds?: string[]
          title?: string
          deleted?: boolean
          heading?: boolean
          icon?: React.ReactNode
      }

export default React.memo(function Clusters({
    authinfo,
    goTo,
    excludeIds,
    title,
    heading,
    deleted,
    icon,
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const { searchCtx } = React.useContext(Contexts.Search)
    const { mainCtx } = React.useContext(Contexts.Main)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
    let [loadQuery, { data, fetchMore, error, loading, refetch, called }] =
        useLazyQuery(clusterFeedQuery, {
            variables: {
                authorization: authinfo?.tokens,
                public:
                    !authinfo?.tokens || !authinfo.tokens.length
                        ? Constants.UseCriteriaPublic.TRUE
                        : Constants.UseCriteriaPublic.TOKEN,
                deleted: searchCtx.deleted
                    ? Constants.UseCriteria.TRUE
                    : Constants.UseCriteria.FALSE,
                include: searchCtx.include,
                exclude: searchCtx.exclude,
                excludeIds: excludeIds,
            },
            nextFetchPolicy: 'cache-and-network',
        })
    React.useEffect(() => {
        expanded.includes(props.nodeId) && loadQuery()
    }, [expanded.includes(props.nodeId)])

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
            const nodeId = deleteable
                ? `clusters::${node.id}`
                : `clusters.${node.id}`
            const name = node.name ? node.name : `...${node.id.slice(-48)}`
            ret.push(
                <TreeItem
                    label={
                        <SidebarTreeItemLabel
                            title={node.description || undefined}
                            deleted={node.deleted}
                            marked
                            leftIcon={<GroupWorkIcon fontSize="small" />}
                        >
                            {name}
                        </SidebarTreeItemLabel>
                    }
                    key={`${props.nodeId}-${nodeId}`}
                    nodeId={`${props.nodeId}-${nodeId}`}
                    onClick={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                    }}
                    onDoubleClick={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        data?.node && goTo({ ...node, title: node.name })
                    }}
                >
                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        deleted={node.deleted}
                        public={Constants.UseCriteriaPublic.TRUE}
                        heading
                        label="Public"
                        nodeId={`${props.nodeId}-${nodeId}-public`}
                    />
                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        authinfo={authinfo}
                        deleted={node.deleted}
                        heading
                        label="Private"
                        nodeId={`${props.nodeId}-${nodeId}-private`}
                        public={Constants.UseCriteriaPublic.FALSE}
                        onClick={(ev) => ev.preventDefault()}
                    />
                </TreeItem>
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
            <TreeItem
                label="Load more clusters..."
                key={`${props.nodeId}-cluster-loadmore`}
                nodeId={`${props.nodeId}-cluster-loadmore`}
                onClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    _loadMore()
                }}
            />
        )
    }

    return (
        <TreeItem
            {...props}
            label={
                <SidebarTreeItemLabel
                    title={title}
                    deleted={deleted}
                    heading={heading}
                    leftIcon={icon}
                    rightIcon={
                        loading || !called ? null : (
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
                        )
                    }
                >
                    {props.label}
                </SidebarTreeItemLabel>
            }
        >
            {...clustersFinished}
        </TreeItem>
    )
})
