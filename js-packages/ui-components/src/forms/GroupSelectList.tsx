import { ApolloClient, useQuery } from '@apollo/client'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Typography from '@mui/material/Typography'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import { checkPrefix, fromGraphqlId } from '@secretgraph/misc/utils/encoding'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

/***
 *  for search
                let roption = labelMap[option]?.name || ''
                let rawId = option
                try {
                    rawId = (fromGraphqlId(option) as [string, string])[1]
                } catch (e) {}
                return `${roption}${rawId}`
 */
export interface GroupSelectListProps {
    initial: boolean
    groups: {}[]
}

export default function GroupSelectList({}: GroupSelectListProps) {
    return null
}
