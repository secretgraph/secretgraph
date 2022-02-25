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
import { contentFeedQuery } from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

import * as Contexts from '../../contexts'
import { elements } from '../../editors'
import SidebarTreeItemLabel from './SidebarTreeItemLabel'

type SideBarItemsProps = {
    authinfo?: Interfaces.AuthInfoInterface
    goTo: (node: any) => void
    refetchNotify?: () => void
    activeContent?: string | null
    cluster?: string | null
    public?: keyof typeof Constants.UseCriteriaPublic
    injectInclude?: string[]
    injectExclude?: string[]
    injectKeys?: string[]
    injectStates?: string[]
    title?: string
    deleted?: boolean
    heading?: boolean
    marked?: boolean
    icon?: React.ReactNode
}

export default React.memo(function Contents({
    authinfo,
    goTo,
    activeContent,
    cluster,
    public: publicParam = Constants.UseCriteriaPublic.IGNORE,
    injectInclude = [],
    injectExclude = [],
    injectKeys = [],
    injectStates = [],
    title,
    deleted,
    marked,
    icon,
    heading,
    refetchNotify,
    ...props
}: SideBarItemsProps & TreeItemProps) {
    const { mainCtx } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { expanded } = React.useContext(Contexts.SidebarItemsExpanded)
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
                includeTags: ['name='],
                include: incl,
                exclude: excl,
                clusters: cluster ? [cluster] : undefined,
                public: publicParam,
                deleted: searchCtx.deleted
                    ? Constants.UseCriteria.TRUE
                    : Constants.UseCriteria.FALSE,
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
            let name = node.tags.find((flag: string) =>
                flag.startsWith('name=')
            )
            if (name) {
                // split works different in js, so match
                name = name.match(/=(.*)/)[1]
            }
            let Icon
            switch (node.type) {
                case 'Message':
                    Icon = MailIcon
                    break
                case 'File':
                    Icon = MovieIcon
                    break
                default:
                    Icon = DescriptionIcon
            }
            if (node.state == 'draft') {
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
                    label={
                        <SidebarTreeItemLabel
                            deleted={node.deleted}
                            marked={mainCtx.item == node.id}
                            leftIcon={<Icon fontSize="small" />}
                        >
                            {`${
                                elements.get(node.type)
                                    ? elements.get(node.type)?.label
                                    : node.type
                            }: ${name ? name : `...${node.id.slice(-48)}`}`}
                        </SidebarTreeItemLabel>
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
                <SidebarTreeItemLabel
                    leftIcon={icon}
                    rightIcon={
                        loading || !called ? null : (
                            <div
                                onClick={(ev) => {
                                    ev.preventDefault()
                                    ev.stopPropagation()
                                    refetch && refetch()
                                    refetchNotify && refetchNotify()
                                }}
                            >
                                <ReplayIcon
                                    fontSize="small"
                                    style={{ marginLeft: '4px' }}
                                />
                            </div>
                        )
                    }
                    title={title}
                    heading={heading}
                    deleted={deleted}
                    marked={marked}
                >
                    {props.label}
                </SidebarTreeItemLabel>
            }
        >
            {...contentsFinished}
        </TreeItem>
    )
})
