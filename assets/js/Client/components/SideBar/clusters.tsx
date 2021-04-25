import { ApolloClient, useApolloClient, useLazyQuery } from '@apollo/client'
import GroupWorkIcon from '@material-ui/icons/GroupWork'
import TreeItem, { TreeItemProps } from '@material-ui/lab/TreeItem'
import * as React from 'react'
import { useAsync } from 'react-async'

import * as Contexts from '../../contexts'
import * as Interfaces from '../../interfaces'
import { clusterFeedQuery } from '../../queries/cluster'
import { useStylesAndTheme } from '../../theme'
import { extractPublicInfo } from '../../utils/cluster'
import { loadAndExtractClusterInfo } from '../../utils/operations'
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
    const client = useApolloClient()
    const { data } = useAsync({
        promiseFn: loadAndExtractClusterInfo,
        id: cluster,
        authorization: authinfo?.tokens,
        client,
        watch: cluster,
    })
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
            onLabelClick={(ev) => {
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
    const { classes } = useStylesAndTheme()
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
                const { name, note } = extractPublicInfo(node.publicInfo)
                const nodeId = (node.availableActions as {
                    type: string
                }[]).some((val) => val.type == 'delete' || val.type == 'manage')
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
                        onLabelClick={(ev) => ev.preventDefault()}
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
                    onLabelClick={(ev) => ev.preventDefault()}
                    cluster={activeCluster}
                    classes={{
                        content: classes.treeItemMarked,
                    }}
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
                        onLabelClick={(ev) => ev.preventDefault()}
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
