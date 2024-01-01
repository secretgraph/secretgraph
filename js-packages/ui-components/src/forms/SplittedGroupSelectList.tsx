import { ApolloClient, useQuery } from '@apollo/client'
import List from '@mui/material/List'
import Table from '@mui/material/Table'
import TableRow from '@mui/material/TableRow'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import { checkPrefix, fromGraphqlId } from '@secretgraph/misc/utils/encoding'
import FormikCheckbox from '../formik/FormikCheckbox'
import { Field, FieldProps, useField } from 'formik'
import * as React from 'react'
import GroupSelectList from './GroupSelectList'
import { GroupSelectListProps } from './GroupSelectList'

declare var gettext: any

/***
 *  for search
                let roption = labelMap[option]?.name || ''
                let rawId = option
                try {
                    rawId = (fromGraphqlId(option) as [string, string])[1]
                } catch (e) {}
                return `${roption}${rawId}`
 */

export default function SplittedGroupSelectList({
    groups,
    ...kwargs
}: GroupSelectListProps) {
    const renderval = React.useMemo(() => {
        const topics = []
        const misc = []
        for (const group of groups) {
            if (group.name.startsWith('topic_')) {
                topics.push(group)
            } else {
                misc.push(group)
            }
        }
        return { topics, misc }
    }, [groups])
    return (
        <>
            {renderval.topics.length ? (
                <details open>
                    <summary>{gettext('topics')}</summary>
                    <GroupSelectList {...kwargs} groups={renderval.topics} />
                </details>
            ) : null}
            {renderval.misc.length ? (
                <details open>
                    <summary>{gettext('misc')}</summary>
                    <GroupSelectList {...kwargs} groups={renderval.misc} />
                </details>
            ) : null}
        </>
    )
}
