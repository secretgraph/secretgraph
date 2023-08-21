import { useLazyQuery } from '@apollo/client'
import DescriptionIcon from '@mui/icons-material/Description'
import DraftsIcon from '@mui/icons-material/Drafts'
import MailIcon from '@mui/icons-material/Mail'
import MovieIcon from '@mui/icons-material/Movie'
import ReplayIcon from '@mui/icons-material/Replay'
import { TreeItem, TreeItemProps } from '@mui/x-tree-view/TreeItem'
import { contentFeedQuery } from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { b64tobuffer, utf8decoder } from '@secretgraph/misc/utils/encoding'
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
    states?: string[]
    title?: string
    deleted?: boolean
    heading?: boolean
    marked?: boolean
    icon?: React.ReactNode
}

export default React.memo(function SidebarContents({
    authinfo,
    goTo,
    activeContent,
    cluster,
    public: publicParam = Constants.UseCriteriaPublic.IGNORE,
    injectInclude = [],
    injectExclude = [],
    states = undefined,
    injectKeys = [],
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
        if (authinfo && publicParam == Constants.UseCriteriaPublic.FALSE) {
            ret.push(
                ...authinfo.certificateHashes.map(
                    (value) => `key_hash=${value}`
                )
            )
        }
        return ret
    }, [searchCtx.include, injectInclude, authinfo?.tokenHashes])
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
                states,
                clusters: cluster ? [cluster] : undefined,
                public: publicParam,
                deleted: searchCtx.deleted
                    ? Constants.UseCriteria.TRUE
                    : Constants.UseCriteria.FALSE,
                count: 30,
                cursor: null,
            },
            nextFetchPolicy: 'cache-and-network',
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
            })
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
                        <div
                            onClick={(ev) => {
                                ev.preventDefault()
                            }}
                            onDoubleClick={(ev) => {
                                ev.preventDefault()
                                ev.stopPropagation()
                                goTo({
                                    ...node,
                                    title: name,
                                })
                            }}
                        >
                            <SidebarTreeItemLabel
                                deleted={node.deleted}
                                marked={mainCtx.item == node.id}
                                leftIcon={<Icon fontSize="small" />}
                            >
                                {`${
                                    elements.get(node.type)
                                        ? elements.get(node.type)?.label
                                        : node.type
                                }: ${name}`}
                            </SidebarTreeItemLabel>
                        </div>
                    }
                    nodeId={`${props.nodeId}-${nodeId}`}
                    key={nodeId}
                />
            )
        }
        return data.contents.contents.edges.map((edge: any) =>
            render_item(edge.node)
        )
    }, [data, mainCtx.type != 'Cluster' ? mainCtx.item : ''])
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
                                    // in case parent should be notified
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
