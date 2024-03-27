import { useLazyQuery } from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
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
    label,
    listProps = {},
}: SideBarItemsProps & {
    listProps?: ListProps
    label: any
}) {
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
                <ListItem
                    onDoubleClick={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        node && goTo({ ...node, title: name })
                    }}
                    key={node.id}
                >
                    <SidebarItemLabel
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
                        {label}
                    </SidebarItemLabel>

                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        authinfo={authinfo}
                        deleted={node.deleted}
                        public={Constants.UseCriteriaPublic.TRUE}
                        heading
                        label="Public"
                    />
                    <SideBarContents
                        goTo={goTo}
                        cluster={node.id}
                        authinfo={authinfo}
                        deleted={node.deleted}
                        heading
                        label="Private"
                        public={Constants.UseCriteriaPublic.FALSE}
                    />
                </ListItem>
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
            <ListItem
                key="cluster-loadmore"
                onClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    _loadMore()
                }}
            >
                Load more clusters...
            </ListItem>
        )
    }

    return (
        <List {...listProps}>
            <SidebarItemLabel
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
                {label}
            </SidebarItemLabel>
            {...clustersFinished}
        </List>
    )
})
