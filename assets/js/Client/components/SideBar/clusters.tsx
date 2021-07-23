import {
    ApolloClient,
    useApolloClient,
    useLazyQuery,
    useQuery,
} from '@apollo/client'
import { useTheme } from '@material-ui/core'
import GroupWorkIcon from '@material-ui/icons/GroupWork'
import TreeItem, { TreeItemProps } from '@material-ui/lab/TreeItem'
import * as React from 'react'

import * as Contexts from '../../contexts'
import * as Interfaces from '../../interfaces'
import { clusterFeedQuery, getClusterQuery } from '../../queries/cluster'
import { extractNameNote } from '../../utils/cluster'
import { useFixedQuery } from '../../utils/hooks'
import SideBarContents from './contents'

const ActiveCluster = React.memo(function ActiveCluster({
    authinfo,
    cluster,
    goTo,
    ...props
}: {
    authinfo?: Interfaces.AuthInfoInterface
    cluster: string
    goTo: (node: any) => void
} & Omit<TreeItemProps, 'label' | 'onDoubleClick'>) {
    const [data, setData] = React.useState<any>(undefined)
    const { mainCtx } = React.useContext(Contexts.Main)
    const { refetch, previousData } = useFixedQuery(getClusterQuery, {
        //pollInterval: ,
        variables: {
            id: cluster,
            authorization: authinfo?.tokens,
        },
        onError: console.error,
        onCompleted: (data) => {
            if (data) {
                setData({
                    ...extractNameNote(data.secretgraph.node.description),
                    node: data.secretgraph.node,
                })
            } else {
                console.log('onCompleted prevented')
            }
        },
    })

    React.useEffect(() => {
        if (data && mainCtx.type == 'Cluster') {
            refetch()
        }
    }, [mainCtx.updateId])
    return (
        <SideBarContents
            goTo={goTo}
            label={
                <span
                    title={data?.note || undefined}
                    style={{ color: data?.node?.deleted ? 'red' : undefined }}
                >
                    <GroupWorkIcon
                        fontSize="small"
                        style={{ marginRight: '4px' }}
                    />
                    <span style={{ wordBreak: 'break-all' }}>
                        {data?.name ? data?.name : `...${cluster.substr(-48)}`}
                    </span>
                </span>
            }
            onClick={(ev) => {
                ev.preventDefault()
            }}
            onDoubleClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                data?.node && goTo({ ...data.node, title: data?.name })
            }}
            cluster={cluster}
            {...props}
        />
    )
})
type SideBarItemsProps = {
    authinfo?: Interfaces.AuthInfoInterface
    goTo: (node: any) => void
    activeCluster?: string | null
}

export default React.memo(function Clusters({
    authinfo,
    goTo,
    activeCluster,
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const theme = useTheme()
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
    let [loadQuery, { data, fetchMore, error, loading }] = useLazyQuery(
        clusterFeedQuery,
        {
            variables: {
                authorization: authinfo && authinfo.tokens,
                deleted: searchCtx.deleted,
                include: searchCtx.include,
                exclude: searchCtx.cluster
                    ? [`id=${activeCluster}`, ...searchCtx.exclude]
                    : searchCtx.exclude,
            },
        }
    )
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
    const clustersFinished: JSX.Element[] = React.useMemo(() => {
        if (!data) {
            return [null]
        }
        return data.clusters.clusters.edges.map(({ node }: any) => {
            if (node.id !== activeCluster) {
                const { name, note } = extractNameNote(node.description)
                const nodeId = (
                    node.availableActions as {
                        type: string
                    }[]
                ).some((val) => val.type == 'delete' || val.type == 'manage')
                    ? `${activeUrl}-clusters::${node.id}`
                    : `${activeUrl}-clusters.${node.id}`
                return (
                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        label={
                            <span
                                title={note || undefined}
                                style={{
                                    whiteSpace: 'nowrap',
                                    color: node.deleted ? 'red' : undefined,
                                }}
                            >
                                <GroupWorkIcon
                                    fontSize="small"
                                    style={{ marginRight: '4px' }}
                                />
                                <span style={{ wordBreak: 'break-all' }}>
                                    {name ? name : `...${node.id.substr(-48)}`}
                                </span>
                            </span>
                        }
                        nodeId={nodeId}
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
        })
    }, [data])
    /*
                disabled={
                    loading ||
                    !!error ||
                    !data.clusters.clusters.pageInfo.hasNextPage
                }*/

    return (
        <TreeItem {...props}>
            {activeCluster && (
                <ActiveCluster
                    nodeId={`${activeUrl}-clusters::${activeCluster}`}
                    authinfo={authinfo}
                    goTo={goTo}
                    onClick={(ev) => ev.preventDefault()}
                    cluster={activeCluster}
                    className={theme.classes.treeItemMarked}
                />
            )}
            {clustersFinished}
            {!loading &&
                !error &&
                data &&
                data.clusters.clusters.pageInfo.hasNextPage && (
                    <TreeItem
                        label="Load more clusters..."
                        nodeId={`${props.nodeId}-cluster-loadmore`}
                        onClick={(ev) => {
                            ev.preventDefault()
                            ev.stopPropagation()
                            _loadMore()
                        }}
                    />
                )}
        </TreeItem>
    )
})
