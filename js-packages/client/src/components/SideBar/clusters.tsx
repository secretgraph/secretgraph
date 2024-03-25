import { useLazyQuery } from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ReplayIcon from '@mui/icons-material/Replay'
import { TreeItem, TreeItemProps } from '@mui/x-tree-view/TreeItem'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { b64tobuffer, utf8decoder } from '@secretgraph/misc/utils/encoding'
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
                        : Constants.UseCriteriaPublic.FALSE,
                deleted: searchCtx.deleted
                    ? Constants.UseCriteria.TRUE
                    : Constants.UseCriteria.FALSE,
                excludeIds: excludeIds,
            },
            nextFetchPolicy: 'cache-and-network',
        })
    React.useEffect(() => {
        expanded.includes(props.itemId) && loadQuery()
    }, [expanded.includes(props.itemId)])

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
            const itemId = deleteable
                ? `clusters::${node.id}`
                : `clusters.${node.id}`
            let name = node.name
            if (!name) {
                name = node.id
                if (name) {
                    try {
                        const rawTxt = utf8decoder.decode(b64tobuffer(name))
                        let [_, tmp] = rawTxt.match(/:(.*)/) as string[]
                        name = tmp
                    } catch (exc) {
                        name = `...${node.id.slice(-48)}`
                    }
                }
            }
            let marked = false
            if (node.__typename == 'Cluster') {
                marked = node.id == mainCtx.item
            } else if (node.cluster && node.cluster.id) {
                marked = node.cluster.id == mainCtx.currentCluster
            }
            ret.push(
                <TreeItem
                    label={
                        <div
                            onClick={(ev) => {
                                ev.preventDefault()
                            }}
                            onDoubleClick={(ev) => {
                                ev.preventDefault()
                                ev.stopPropagation()
                                node && goTo({ ...node, title: name })
                            }}
                        >
                            <SidebarTreeItemLabel
                                title={node.description || undefined}
                                deleted={node.deleted}
                                marked={marked}
                                leftIcon={<GroupWorkIcon fontSize="small" />}
                            >
                                {name}
                            </SidebarTreeItemLabel>
                        </div>
                    }
                    key={`${props.itemId}-${itemId}`}
                    itemId={`${props.itemId}-${itemId}`}
                >
                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        authinfo={authinfo}
                        deleted={node.deleted}
                        public={Constants.UseCriteriaPublic.TRUE}
                        heading
                        label="Public"
                        itemId={`${props.itemId}-${itemId}-public`}
                    />
                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        authinfo={authinfo}
                        deleted={node.deleted}
                        heading
                        label="Private"
                        itemId={`${props.itemId}-${itemId}-private`}
                        public={Constants.UseCriteriaPublic.FALSE}
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
                key={`${props.itemId}-cluster-loadmore`}
                itemId={`${props.itemId}-cluster-loadmore`}
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
