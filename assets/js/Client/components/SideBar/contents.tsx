import { gql, useLazyQuery } from '@apollo/client'
import Divider from '@material-ui/core/Divider'
import List, { ListProps } from '@material-ui/core/List'
import DescriptionIcon from '@material-ui/icons/Description'
import DraftsIcon from '@material-ui/icons/Drafts'
import MailIcon from '@material-ui/icons/Mail'
import MovieIcon from '@material-ui/icons/Movie'
import TreeItem, { TreeItemProps } from '@material-ui/lab/TreeItem'
import * as React from 'react'

import * as Contexts from '../../contexts'
import { ActiveUrl, Search } from '../../contexts'
import { elements } from '../../editors'
import * as Interfaces from '../../interfaces'
import { useStylesAndTheme } from '../../theme'

const contentFeedQuery = gql`
    query SideBarContentFeedQuery(
        $clusters: [ID!]
        $authorization: [String!]
        $include: [String!]
        $exclude: [String!]
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
                public: $public
                first: $count
                after: $cursor
            )
                @connection(
                    key: "SideBar_contents"
                    filters: ["include", "exclude", "clusters", "public"]
                ) {
                edges {
                    node {
                        id
                        nonce
                        link
                        updateId
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
    state?: string
    goTo: (node: any) => void
    activeContent?: string | null
    activeCluster?: string | null
    usePublic?: boolean
}

// ["type=", "state=", ...
export default function Contents({
    authinfo,
    state,
    goTo,
    activeContent,
    activeCluster,
    usePublic,
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const { classes, theme } = useStylesAndTheme()
    const { searchCtx } = React.useContext(Search)
    const { activeUrl } = React.useContext(ActiveUrl)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
    const _usePublic = usePublic === undefined ? null : usePublic
    const incl = searchCtx.include.concat([])
    if (state) {
        incl.push(`state=${state}`)
    }
    if (authinfo) {
        incl.push(...authinfo.hashes.map((value) => `hash=${value}`))
    }
    const [loadQuery, { data, error, fetchMore, loading }] = useLazyQuery(
        contentFeedQuery,
        {
            variables: {
                authorization: authinfo ? authinfo.keys : null,
                includeTags: ['state=', 'type=', 'name='],
                include: incl,
                exclude: searchCtx.exclude,
                clusters: activeCluster ? [activeCluster] : undefined,
                public: _usePublic,
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
                    cursor: data.contents.contents.pageInfo.endCursor,
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
            const nodeId = `${activeUrl}:contents::${node.id}`
            return (
                <TreeItem
                    label={
                        <span>
                            <Icon fontSize="small" />
                            {`${
                                elements.get(type)
                                    ? elements.get(type)?.label
                                    : type
                            }: ${name ? name : '...' + node.id.substr(-48)}`}
                        </span>
                    }
                    nodeId={nodeId}
                    key={nodeId}
                    onDoubleClick={() => goTo(node)}
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
                        nodeId={`${props.nodeId}:contents:loadmore`}
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
