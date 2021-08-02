import { gql, useLazyQuery } from '@apollo/client'
import Divider from '@material-ui/core/Divider'
import List, { ListProps } from '@material-ui/core/List'
import { useTheme } from '@material-ui/core/styles'
import DescriptionIcon from '@material-ui/icons/Description'
import DraftsIcon from '@material-ui/icons/Drafts'
import MailIcon from '@material-ui/icons/Mail'
import MovieIcon from '@material-ui/icons/Movie'
import TreeItem, { TreeItemProps } from '@material-ui/lab/TreeItem'
import * as React from 'react'

import * as Interfaces from '../../../../utils/interfaces'
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
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const theme = useTheme()
    const { mainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { activeUrl } = React.useContext(Contexts.ActiveUrl)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
    const _usePublic = usePublic === undefined ? null : usePublic
    const incl = searchCtx.include.concat(injectInclude)
    const excl = searchCtx.exclude.concat(injectExclude)
    if (authinfo) {
        incl.push(...authinfo.hashes.map((value) => `hash=${value}`))
    }
    //console.log(incl, excl)
    const [loadQuery, { data, error, fetchMore, loading }] = useLazyQuery(
        contentFeedQuery,
        {
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
        }
    )
    React.useEffect(() => {
        expanded.includes(props.nodeId) && loadQuery()
    }, [expanded.includes(props.nodeId)])
    const _loadMore = () => {
        fetchMore &&
            fetchMore({
                variables: {
                    cursor: data.contents.pageInfo.endCursor,
                },
            }).then((result: any) => {})
    }

    const contentsFinished: JSX.Element[] = React.useMemo(() => {
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
            const nodeId = (node.availableActions as { type: string }[]).some(
                (val) => val.type == 'delete' || val.type == 'manage'
            )
                ? `${activeUrl}-contents::${node.id}`
                : `${activeUrl}-contents.${node.id}`
            return (
                <TreeItem
                    className={
                        mainCtx.item == node.id
                            ? theme.classes.treeItemMarked
                            : undefined
                    }
                    label={
                        <span
                            style={{ color: node.deleted ? 'red' : undefined }}
                        >
                            <Icon
                                fontSize="small"
                                style={{ marginRight: '4px' }}
                            />
                            <span style={{ wordBreak: 'break-all' }}>
                                {`${
                                    elements.get(type)
                                        ? elements.get(type)?.label
                                        : type
                                }: ${
                                    name ? name : `...${node.id.substr(-48)}`
                                }`}
                            </span>
                        </span>
                    }
                    nodeId={nodeId}
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

    return (
        <TreeItem {...props}>
            {contentsFinished}
            {!loading &&
                !error &&
                data &&
                data.contents.contents.pageInfo.hasNextPage && (
                    <TreeItem
                        label="Load more contents..."
                        nodeId={`${props.nodeId}-contents-loadmore`}
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
