import { gql, useLazyQuery } from '@apollo/client'
import DescriptionIcon from '@mui/icons-material/Description'
import DraftsIcon from '@mui/icons-material/Drafts'
import MailIcon from '@mui/icons-material/Mail'
import MovieIcon from '@mui/icons-material/Movie'
import ReplayIcon from '@mui/icons-material/Replay'
import TreeItem, { TreeItemProps } from '@mui/lab/TreeItem'
import Divider from '@mui/material/Divider'
import List, { ListProps } from '@mui/material/List'
import { useTheme } from '@mui/material/styles'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

import * as Contexts from '../../contexts'
import { elements } from '../../editors'

const contentFeedQuery = gql`
    query SideBarContentFeedQuery(
        $clusters: [ID!]
        $authorization: [String!]
        $include: [String!]
        $exclude: [String!]
        $deleted: Boolean
        $public: Boolean
        $includeTags: [String!]
        $count: Int
        $cursor: String
    ) {
        contents: secretgraph(authorization: $authorization) {
            contents(
                clusters: $clusters
                includeTags: $include
                excludeTags: $exclude
                deleted: $deleted
                public: $public
                first: $count
                after: $cursor
            )
                @connection(
                    key: "feedContents"
                    filter: [
                        "authorization"
                        "clusters"
                        "includeTags"
                        "excludeTags"
                        "deleted"
                        "public"
                    ]
                ) {
                edges {
                    node {
                        id
                        nonce
                        link
                        updateId
                        deleted
                        tags(includeTags: $includeTags)
                        references(
                            groups: ["key", "signature"]
                            includeTags: $include
                        ) {
                            edges {
                                node {
                                    extra
                                    target {
                                        tags(includeTags: ["key_hash="])
                                    }
                                }
                            }
                        }
                        availableActions {
                            type
                        }
                    }
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    }
`

type SideBarItemsProps = {
    authinfo?: Interfaces.AuthInfoInterface
    goTo: (node: any) => void
    activeContent?: string | null
    cluster?: string | null
    usePublic?: boolean
    injectInclude?: string[]
    injectExclude?: string[]
    title?: string
    deleted?: boolean
}

// ["type=", "state=", ...
export default React.memo(function Contents({
    authinfo,
    goTo,
    activeContent,
    cluster,
    usePublic,
    injectInclude = [],
    injectExclude = [],
    title,
    deleted,
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const theme = useTheme()
    const { mainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
    const _usePublic = usePublic === undefined ? null : usePublic
    const incl = React.useMemo(() => {
        const ret = searchCtx.include.concat(injectInclude)
        if (authinfo) {
            ret.push(
                ...authinfo.certificateHashes.map(
                    (value) => `key_hash=${value}`
                )
            )
        }
        return ret
    }, [searchCtx.include, injectInclude, authinfo?.hashes])
    const excl = React.useMemo(
        () => searchCtx.exclude.concat(injectExclude),
        [searchCtx.exclude, injectExclude]
    )
    //console.log(incl, excl)
    const [loadQuery, { data, error, fetchMore, loading, refetch, called }] =
        useLazyQuery(contentFeedQuery, {
            variables: {
                authorization: authinfo ? authinfo.tokens : null,
                includeTags: ['state=', 'type=', 'name='],
                include: incl,
                exclude: excl,
                clusters: cluster ? [cluster] : undefined,
                public: _usePublic,
                deleted: searchCtx.deleted,
                count: 30,
                cursor: null,
            },
        })
    React.useEffect(() => {
        expanded.includes(props.nodeId) && loadQuery()
    }, [expanded.includes(props.nodeId)])
    const _loadMore = () => {
        fetchMore &&
            fetchMore({
                variables: {
                    cursor: data.contents.contents.pageInfo.endCursor,
                },
            }).then((result: any) => {})
    }

    const contentsHalfFinished: (JSX.Element | null)[] = React.useMemo(() => {
        if (!data) {
            return [null]
        }
        const render_item = (node: any) => {
            let type = node.tags.find((flag: string) =>
                flag.startsWith('type=')
            )
            let state = node.tags.find((flag: string) =>
                flag.startsWith('state=')
            )
            let name = node.tags.find((flag: string) =>
                flag.startsWith('name=')
            )
            if (type) {
                // split works different in js, so match
                type = type.match(/=(.*)/)[1]
            }
            if (state) {
                // split works different in js, so match
                state = state.match(/=(.*)/)[1]
            }
            if (name) {
                // split works different in js, so match
                name = name.match(/=(.*)/)[1]
            }
            let Icon
            switch (type) {
                case 'Message':
                    Icon = MailIcon
                    break
                case 'File':
                    Icon = MovieIcon
                    break
                default:
                    Icon = DescriptionIcon
            }
            if (state == 'draft') {
                Icon = DraftsIcon
            }

            // TODO: check availability of extra content permissions. Merge authInfos
            // for now assume yes if manage type was not specified

            //console.debug('available actions', node.availableActions)
            const deleteable =
                !authinfo ||
                !authinfo.types.has('manage') ||
                (
                    node.availableActions as {
                        type: string
                    }[]
                ).some((val) => val.type == 'delete' || val.type == 'manage')
            const nodeId = deleteable
                ? `contents::${node.id}`
                : `contents.${node.id}`
            return (
                <TreeItem
                    className={
                        mainCtx.item == node.id
                            ? theme.classes.treeItemMarked
                            : undefined
                    }
                    label={
                        <div
                            className={theme.classes.sidebarTreeItemLabel}
                            style={{
                                color: node.deleted ? 'red' : undefined,
                            }}
                        >
                            <Icon
                                fontSize="small"
                                style={{ marginRight: '4px' }}
                            />
                            <div
                                className={
                                    theme.classes.sidebarTreeItemLabelInner
                                }
                            >
                                {`${
                                    elements.get(type)
                                        ? elements.get(type)?.label
                                        : type
                                }: ${
                                    name ? name : `...${node.id.substr(-48)}`
                                }`}
                            </div>
                        </div>
                    }
                    nodeId={`${props.nodeId}-${nodeId}`}
                    key={nodeId}
                    onClick={(ev) => ev.preventDefault()}
                    onDoubleClick={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        goTo(node)
                    }}
                />
            )
        }
        return data.contents.contents.edges.map((edge: any) =>
            render_item(edge.node)
        )
    }, [data])
    const contentsFinished = [...contentsHalfFinished]
    if (
        !loading &&
        !error &&
        data &&
        data.contents.contents.pageInfo.hasNextPage
    ) {
        contentsFinished.push(
            <TreeItem
                label="Load more contents..."
                nodeId={`${props.nodeId}-contents-loadmore`}
                key={`${props.nodeId}-contents-loadmore`}
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
                <div
                    className={theme.classes.sidebarTreeItemLabel}
                    title={title}
                    style={{
                        color: deleted ? 'red' : undefined,
                    }}
                >
                    {props.label}
                    {loading || !called ? null : (
                        <div
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
                        </div>
                    )}
                </div>
            }
        >
            {...contentsFinished}
        </TreeItem>
    )
})
