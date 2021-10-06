import {
    ApolloClient,
    useApolloClient,
    useLazyQuery,
    useQuery,
} from '@apollo/client'
import { useTheme } from '@material-ui/core'
import GroupWorkIcon from '@material-ui/icons/GroupWork'
import ReplayIcon from '@material-ui/icons/Replay'
import TreeItem, { TreeItemProps } from '@material-ui/lab/TreeItem'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    clusterFeedQuery,
    getClusterQuery,
} from '@secretgraph/misc/queries/cluster'
import { extractNameNote } from '@secretgraph/misc/utils/cluster'
import * as React from 'react'

import * as Contexts from '../../contexts'
import SideBarContents from './contents'

export const ActiveCluster = React.memo(function ActiveCluster({
    tokens,
    cluster,
    goTo,
    ...props
}: {
    tokens: string[]
    cluster: string
    goTo: (node: any) => void
} & Omit<TreeItemProps, 'label' | 'onDoubleClick'>) {
    const [data, setData] = React.useState<any>(undefined)
    const theme = useTheme()
    const { mainCtx } = React.useContext(Contexts.Main)
    const {
        refetch,
        data: dataUnfinished,
        loading,
    } = useQuery(getClusterQuery, {
        //pollInterval: ,
        variables: {
            id: cluster,
            authorization: tokens,
        },
        onError: console.error,
    })
    React.useEffect(() => {
        if (dataUnfinished && dataUnfinished.secretgraph.node) {
            setData({
                ...extractNameNote(dataUnfinished.secretgraph.node.description),
                node: dataUnfinished.secretgraph.node,
            })
        }
    }, [dataUnfinished])

    React.useEffect(() => {
        if (data && mainCtx.type == 'Cluster') {
            refetch()
        }
    }, [mainCtx.updateId])
    return (
        <SideBarContents
            goTo={goTo}
            deleted={data?.node?.deleted}
            label={
                <>
                    <GroupWorkIcon
                        fontSize="small"
                        style={{ marginRight: '4px' }}
                    />
                    <div className={theme.classes.sidebarTreeItemLabelInner}>
                        {data?.name ? data?.name : `...${cluster.substr(-48)}`}
                    </div>
                </>
            }
            onClick={(ev) => {
                ev.preventDefault()
            }}
            onDoubleClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                data?.node && goTo({ ...data?.node, title: data?.name })
            }}
            cluster={cluster}
            {...props}
        />
    )
})
type SideBarItemsProps =
    | {
          tokens: string[]
          goTo: (node: any) => void
          activeCluster?: string | null
          title?: string
          deleted?: boolean
      }
    | {
          tokens?: string[]
          goTo: (node: any) => void
          activeCluster?: null | undefined
          title?: string
          deleted?: boolean
      }

export default React.memo(function Clusters({
    tokens,
    goTo,
    activeCluster,
    title,
    deleted,
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const theme = useTheme()
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
    let [
        loadQuery,
        { data, fetchMore, error, loading, refetch, called, variables },
    ] = useLazyQuery(clusterFeedQuery, {
        variables: {
            authorization: tokens,
            public: !tokens || !tokens.length,
            deleted: searchCtx.deleted,
            include: searchCtx.include,
            exclude: searchCtx.exclude,
        },
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
            // activeCluster cannot be filtered, so do it manually
            if (node.id !== activeCluster) {
                const { name, note } = extractNameNote(node.description)
                const nodeId = (
                    node.availableActions as {
                        type: string
                    }[]
                ).some((val) => val.type == 'delete' || val.type == 'manage')
                    ? `${activeUrl}-clusters::${node.id}`
                    : `${activeUrl}-clusters.${node.id}`
                ret.push(
                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        title={note || undefined}
                        deleted={node.deleted}
                        label={
                            <>
                                <GroupWorkIcon
                                    fontSize="small"
                                    style={{
                                        marginRight: '4px',
                                    }}
                                />
                                <div
                                    className={
                                        theme.classes.sidebarTreeItemLabelInner
                                    }
                                    style={{
                                        color: node.deleted ? 'red' : undefined,
                                    }}
                                >
                                    {name ? name : `...${node.id.substr(-48)}`}
                                </div>
                            </>
                        }
                        nodeId={`${props.nodeId}-${nodeId}`}
                        key={nodeId}
                        onClick={(ev) => ev.preventDefault()}
                        onDoubleClick={(ev) => {
                            ev.preventDefault()
                            ev.stopPropagation()
                            goTo({ ...node, title: name })
                        }}
                    />
                )
            }
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
        <>
            {activeCluster ? (
                <ActiveCluster
                    nodeId={`${activeUrl}-clusters::${activeCluster}`}
                    tokens={tokens as string[]}
                    goTo={goTo}
                    onClick={(ev) => ev.preventDefault()}
                    cluster={activeCluster}
                    className={theme.classes.treeItemMarked}
                />
            ) : null}
            <TreeItem
                {...props}
                label={
                    <div
                        className={theme.classes.sidebarTreeItemLabel}
                        title={title}
                        style={{
                            color: deleted ? 'red' : undefined,
                        }}
                    >
                        {props.label}
                        {loading || !called ? null : (
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
                    </div>
                }
            >
                {...clustersFinished}
            </TreeItem>
        </>
    )
})
