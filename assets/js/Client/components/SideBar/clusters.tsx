import { ApolloClient, useApolloClient, useLazyQuery } from '@apollo/client'
import GroupWorkIcon from '@material-ui/icons/GroupWork'
import TreeItem, { TreeItemProps } from '@material-ui/lab/TreeItem'
import * as React from 'react'

import * as Contexts from '../../contexts'
import * as Interfaces from '../../interfaces'
import { clusterFeedQuery } from '../../queries/cluster'
import { useStylesAndTheme } from '../../theme'
import { extractPublicInfo } from '../../utils/cluster'
import { loadAndExtractClusterInfo } from '../../utils/operations'
import SideBarContents from './contents'

async function title_helper({
    client,
    authorization,
    id,
    canceled,
    setName,
    setNote,
    setDeleted,
}: {
    client: ApolloClient<any>
    authorization: string[]
    id: string
    canceled: () => boolean
    setName: (arg: string) => void
    setNote: (arg: string) => void
    setDeleted: (arg: Date | null) => void
}) {
    const { name, note, node } = await loadAndExtractClusterInfo({
        client,
        authorization,
        id,
    })
    if (canceled()) {
        return
    }
    name && setName(name)
    note && setNote(note)
    setDeleted(node.deleted)
}

function ActiveCluster({
    authinfo,
    cluster,
    goTo,
    ...props
}: {
    authinfo?: Interfaces.AuthInfoInterface
    cluster: string
    goTo?: (node: any) => void
} & Omit<TreeItemProps, 'label' | 'nodeId'>) {
    const { classes, theme } = useStylesAndTheme()
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const client = useApolloClient()
    const [clusterName, setClusterName] = React.useState<undefined | string>(
        undefined
    )
    const [clusterNote, setClusterNote] = React.useState('')
    const [deleted, setDeleted] = React.useState<undefined | Date | null>(
        undefined
    )

    React.useLayoutEffect(() => {
        setClusterName(undefined)

        let finished = false
        const cancel = () => {
            finished = true
        }
        title_helper({
            client,
            authorization: authinfo ? authinfo.keys : [],
            id: cluster,
            setName: setClusterName,
            setNote: setClusterNote,
            setDeleted,
            canceled: () => finished == true,
        })
        return cancel
    }, [cluster])
    if (goTo) {
        return (
            <SideBarContents
                nodeId={`active:${activeUrl}:${cluster}`}
                goTo={goTo}
                label={
                    <span
                        title={clusterNote || undefined}
                        style={{ color: deleted ? 'red' : undefined }}
                    >
                        <GroupWorkIcon
                            fontSize="small"
                            style={{ marginRight: '4px' }}
                        />
                        <span style={{ wordBreak: 'break-all' }}>
                            {clusterName !== undefined
                                ? clusterName
                                : `...${cluster.substr(-48)}`}
                        </span>
                    </span>
                }
                {...props}
            />
        )
    } else {
        return (
            <TreeItem
                nodeId={`active:${activeUrl}:${cluster}`}
                label={
                    <span
                        title={clusterNote || undefined}
                        style={{ color: deleted ? 'red' : undefined }}
                    >
                        <GroupWorkIcon
                            fontSize="small"
                            style={{ marginRight: '4px' }}
                        />
                        {clusterName !== undefined
                            ? clusterName
                            : `...${cluster.substr(-48)}`}
                    </span>
                }
                {...props}
            />
        )
    }
}
type SideBarItemsProps = {
    authinfo?: Interfaces.AuthInfoInterface
    goTo: (node: any) => void
    activeCluster?: string | null
}

export default function Clusters({
    authinfo,
    goTo,
    activeCluster,
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const { classes } = useStylesAndTheme()
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
    if (!activeCluster) {
        activeCluster = searchCtx.cluster
    }
    let [loadQuery, { data, fetchMore, error, loading }] = useLazyQuery(
        clusterFeedQuery,
        {
            variables: {
                authorization: authinfo && authinfo.keys,
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
                const nodeId = `${activeUrl}-cluster::${node.id}`
                return (
                    <SideBarContents
                        goTo={goTo}
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
                        onDoubleClick={() => goTo(node)}
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
                    authinfo={authinfo}
                    goTo={goTo}
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
                        onClick={(ev) => {
                            ev.preventDefault()
                            ev.stopPropagation()
                            _loadMore()
                        }}
                    />
                )}
        </TreeItem>
    )
}
