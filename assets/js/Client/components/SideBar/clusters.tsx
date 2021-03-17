import { ApolloClient, useApolloClient, useQuery } from '@apollo/client'
import Divider from '@material-ui/core/Divider'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ListSubheader from '@material-ui/core/ListSubheader'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore'
import GroupWorkIcon from '@material-ui/icons/GroupWork'
import TreeItem, { TreeItemProps } from '@material-ui/lab/TreeItem'
import * as React from 'react'

import * as Contexts from '../../contexts'
import * as Interfaces from '../../interfaces'
import { clusterFeedQuery } from '../../queries/cluster'
import { useStylesAndTheme } from '../../theme'
import { extractPublicInfo } from '../../utils/cluster'
import { loadAndExtractClusterInfo } from '../../utils/operations'

async function title_helper({
    client,
    authorization,
    id,
    canceled,
    setName,
    setNote,
}: {
    client: ApolloClient<any>
    authorization: string[]
    id: string
    canceled: () => boolean
    setName: (arg: string) => void
    setNote: (arg: string) => void
}) {
    const { name, note } = await loadAndExtractClusterInfo({
        client,
        authorization,
        id,
    })
    if (canceled()) {
        return
    }
    name && setName(name)
    note && setNote(note)
}

function ActiveCluster({
    authinfo,
    cluster,
    ...props
}: {
    authinfo: Interfaces.AuthInfoInterface
    cluster: string
} & Omit<TreeItemProps, 'label' | 'nodeId'>) {
    const { classes, theme } = useStylesAndTheme()
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const client = useApolloClient()
    const [clusterName, setClusterName] = React.useState<undefined | string>(
        undefined
    )
    const [clusterNote, setClusterNote] = React.useState('')

    React.useLayoutEffect(() => {
        setClusterName(undefined)

        let finished = false
        const cancel = () => {
            finished = true
        }
        title_helper({
            client,
            authorization: authinfo.keys,
            id: cluster,
            setName: setClusterName,
            setNote: setClusterNote,
            canceled: () => finished == true,
        })
        return cancel
    }, [cluster])
    return (
        <TreeItem
            nodeId={`active:${activeUrl}:${cluster}`}
            label={
                <span title={clusterNote || undefined}>
                    <GroupWorkIcon fontSize="small" />
                    {clusterName !== undefined
                        ? clusterName
                        : `...${cluster.substr(-48)}`}
                </span>
            }
            {...props}
        />
    )
}
type SideBarItemsProps = {
    authinfo: Interfaces.AuthInfoInterface
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
    if (!activeCluster) {
        activeCluster = searchCtx.cluster
    }
    let { data, fetchMore, error, loading } = useQuery(clusterFeedQuery, {
        variables: {
            authorization: authinfo.keys,
            include: searchCtx.include,
            exclude: searchCtx.cluster
                ? [`id=${activeCluster}`, ...searchCtx.exclude]
                : searchCtx.exclude,
        },
    })

    const _loadMore = () => {
        fetchMore({
            variables: {
                cursor: data.clusters.clusters.pageInfo.endCursor,
            },
        })
    }
    const clustersFinished: JSX.Element[] = React.useMemo(() => {
        if (!data) {
            return []
        }
        return data.clusters.clusters.edges.map((edge: any) => {
            if (edge.node.id !== activeCluster) {
                const { name, note } = extractPublicInfo(edge.node.publicInfo)
                const nodeId = `${activeUrl}:cluster::${edge.node.id}`
                return (
                    <TreeItem
                        label={
                            <span title={note || undefined}>
                                <GroupWorkIcon fontSize="small" />
                                {name ? name : `...${edge.node.id.substr(-48)}`}
                            </span>
                        }
                        nodeId={nodeId}
                        key={nodeId}
                        onDoubleClick={() => goTo(edge.node)}
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
                <ActiveCluster authinfo={authinfo} cluster={activeCluster} />
            )}
            {clustersFinished}
            {!loading && !error && data.clusters.clusters.pageInfo.hasNextPage && (
                <TreeItem
                    label="Load more clusters..."
                    nodeId={`${activeUrl}:cluster:loadmore`}
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
