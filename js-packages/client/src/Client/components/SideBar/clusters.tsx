import {
    ApolloClient,
    useApolloClient,
    useLazyQuery,
    useQuery,
} from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ReplayIcon from '@mui/icons-material/Replay'
import TreeItem, { TreeItemProps } from '@mui/lab/TreeItem'
import { useTheme } from '@mui/material'
import {
    clusterFeedQuery,
    getClusterQuery,
} from '@secretgraph/graphql-queries/cluster'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { extractNameNote } from '@secretgraph/misc/utils/cluster'
import * as React from 'react'

import * as Contexts from '../../contexts'
import SideBarContents from './contents'
import SidebarTreeItemLabel from './SidebarTreeItemLabel'

export const ActiveCluster = React.memo(function ActiveCluster({
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
            authorization: authinfo?.tokens,
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
            authinfo={authinfo}
            deleted={data?.node?.deleted}
            marked
            title={data?.note}
            icon={<GroupWorkIcon fontSize="small" />}
            label={data?.name ? data?.name : `...${cluster.substr(-48)}`}
            onClick={(ev) => {
                ev.preventDefault()
            }}
            onDoubleClick={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                data?.node && goTo({ ...data?.node, title: data?.name })
            }}
            cluster={cluster}
            // state public needs no key_hash
            injectInclude={['state=public']}
            {...props}
        />
    )
})
type SideBarItemsProps =
    | {
          authinfo: Interfaces.AuthInfoInterface
          goTo: (node: any) => void
          activeCluster: string
          title?: string
          deleted?: boolean
          heading?: boolean
          icon?: React.ReactNode
      }
    | {
          authinfo?: Interfaces.AuthInfoInterface
          goTo: (node: any) => void
          activeCluster?: null | undefined
          title?: string
          deleted?: boolean
          heading?: boolean
          icon?: React.ReactNode
      }

export default React.memo(function Clusters({
    authinfo,
    goTo,
    activeCluster,
    title,
    heading,
    deleted,
    icon,
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const { mainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
    let [
        loadQuery,
        { data, fetchMore, error, loading, refetch, called, variables },
    ] = useLazyQuery(clusterFeedQuery, {
        variables: {
            authorization: authinfo?.tokens,
            public: !authinfo?.tokens || !authinfo.tokens.length,
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
                // TODO: check availability of extra cluster permissions. Merge authInfos
                // for now assume yes if manage type was not specified
                const deleteable =
                    !authinfo ||
                    !authinfo.types.has('manage') ||
                    (
                        node.availableActions as {
                            type: string
                        }[]
                    ).some(
                        (val) => val.type == 'delete' || val.type == 'manage'
                    )
                const nodeId = deleteable
                    ? `clusters::${node.id}`
                    : `clusters.${node.id}`
                ret.push(
                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        authinfo={authinfo}
                        title={note || undefined}
                        deleted={node.deleted}
                        marked={mainCtx.item == node.id}
                        // state public needs no key_hash
                        injectInclude={['state=public']}
                        icon={<GroupWorkIcon fontSize="small" />}
                        label={name ? name : `...${node.id.substr(-48)}`}
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
        <TreeItem
            {...props}
            label={
                <SidebarTreeItemLabel
                    title={title}
                    deleted={deleted}
                    heading={heading}
                    icon={icon}
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
                </SidebarTreeItemLabel>
            }
        >
            {activeCluster ? (
                <ActiveCluster
                    nodeId={`${props.nodeId}-active-clusters::${activeCluster}`}
                    authinfo={authinfo}
                    goTo={goTo}
                    onClick={(ev) => ev.preventDefault()}
                    cluster={activeCluster}
                />
            ) : null}
            {...clustersFinished}
        </TreeItem>
    )
})
