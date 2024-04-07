import { useLazyQuery } from '@apollo/client'
import DescriptionIcon from '@mui/icons-material/Description'
import DraftsIcon from '@mui/icons-material/Drafts'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import MailIcon from '@mui/icons-material/Mail'
import MovieIcon from '@mui/icons-material/Movie'
import ReplayIcon from '@mui/icons-material/Replay'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import List from '@mui/material/List'
import { contentFeedQuery } from '@secretgraph/graphql-queries/content'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { b64tobuffer, utf8decoder } from '@secretgraph/misc/utils/encoding'
import * as React from 'react'
import SidebarItemLabel from './SidebarItemLabel'
import ListItemText from '@mui/material/ListItemText'
import ListItemButton from '@mui/material/ListItemButton'
import IconButton from '@mui/material/IconButton'
import Checkbox from '@mui/material/Checkbox'

import * as Contexts from '../../contexts'
import { elements } from '../../editors'
import ContentItem from './ContentItem'

type SideBarItemsProps = {
    authinfoContent?: Interfaces.AuthInfoInterface
    activeContent?: string | null
    cluster?: string | null
    public?: keyof typeof Constants.UseCriteriaPublic
    injectInclude?: string[]
    injectExclude?: string[]
    injectKeys?: string[]
    states?: string[]
    title?: string
    deleted?: boolean
    label: string
}

export default React.memo(function SidebarContents({
    authinfoContent,
    cluster,
    public: publicParam = Constants.UseCriteriaPublic.IGNORE,
    injectInclude = [],
    injectExclude = [],
    states = undefined,
    injectKeys = [],
    title,
    deleted,
    label,
}: SideBarItemsProps) {
    const { mainCtx, goToNode } = React.useContext(Contexts.Main)
    const { searchCtx } = React.useContext(Contexts.Search)
    const { selected, setSelected } = React.useContext(
        Contexts.SidebarItemsSelected
    )

    const [expanded, setExpanded] = React.useState(false)
    const incl = React.useMemo(() => {
        const ret = searchCtx.include.concat(injectInclude)
        if (
            authinfoContent &&
            publicParam == Constants.UseCriteriaPublic.FALSE
        ) {
            ret.push(
                ...authinfoContent.certificateHashes.map(
                    (value) => `key_hash=${value}`
                )
            )
        }
        return ret
    }, [searchCtx.include, injectInclude, authinfoContent?.tokenHashes])
    const excl = React.useMemo(
        () => searchCtx.exclude.concat(injectExclude),
        [searchCtx.exclude, injectExclude]
    )
    //console.log(incl, excl)
    const [loadQuery, { data, error, fetchMore, loading, refetch, called }] =
        useLazyQuery(contentFeedQuery, {
            variables: {
                authorization: authinfoContent ? authinfoContent.tokens : null,
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
        expanded && loadQuery()
    }, [expanded])
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
        return data.contents.contents.edges.map((edge: any) => (
            <ContentItem node={edge.node} authinfoContent={authinfoContent} />
        ))
    }, [data])
    const contentsFinished = [...contentsHalfFinished]
    if (
        !loading &&
        !error &&
        data &&
        data.contents.contents.pageInfo.hasNextPage
    ) {
        contentsFinished.push(
            <ListItemButton
                key="contents-loadmore"
                onClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    _loadMore()
                }}
            >
                <ListItemText>Load more contents...</ListItemText>
            </ListItemButton>
        )
    }
    return (
        <>
            <SidebarItemLabel
                title={title}
                deleted={deleted}
                listItemProps={{
                    dense: true,
                    selected: mainCtx.item == cluster,
                }}
                primary={label}
                rightOfLabel={
                    <ListItemSecondaryAction>
                        {loading || !called || !expanded ? null : (
                            <IconButton
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
                            </IconButton>
                        )}
                        <IconButton
                            edge={'end'}
                            onClick={(ev) => {
                                ev.preventDefault()
                                ev.stopPropagation()
                                setExpanded(!expanded)
                            }}
                        >
                            {expanded ? (
                                <ExpandMoreIcon
                                    fontSize="small"
                                    style={{ marginLeft: '4px' }}
                                />
                            ) : (
                                <ExpandLessIcon
                                    fontSize="small"
                                    style={{ marginLeft: '4px' }}
                                />
                            )}
                        </IconButton>
                    </ListItemSecondaryAction>
                }
            />

            {expanded ? (
                <List
                    component="div"
                    disablePadding
                    dense
                    sx={{ pl: 1, pr: 1 }}
                >
                    {...contentsFinished}
                </List>
            ) : null}
        </>
    )
})
