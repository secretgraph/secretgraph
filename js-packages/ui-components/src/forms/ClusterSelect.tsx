import { ApolloClient, useQuery } from '@apollo/client'
import { Box, Typography } from '@mui/material'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import { fromGraphqlId } from '@secretgraph/misc/utils/encoding'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

/***
 *  for search
                let roption = labelMap[option]?.name || ''
                let rawId = option
                try {
                    rawId = (fromGraphqlId(option) as [string, string])[1]
                } catch (e) {}
                return `${roption}${rawId}`
 */
export interface ClusterSelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends Omit<
        SimpleSelectProps<string, Multiple, DisableClearable, FreeSolo>,
        'options' | 'getOptionLabel' | 'loading'
    > {
    client?: ApolloClient<any>
    firstIfEmpty?: boolean
    tokens: string[]
}

const _valid_set = new Set(['manage', 'create'])

export default function ClusterSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
>({
    client,
    firstIfEmpty,
    tokens,
    ...props
}: ClusterSelectProps<Multiple, DisableClearable, FreeSolo> &
    FieldProps<
        AutocompleteValue<string, Multiple, DisableClearable, FreeSolo>
    >) {
    const [inputValue, setInputValue] = React.useState('')
    const deferredInput = React.useDeferredValue(inputValue)
    const { fetchMore, data, loading } = useQuery(clusterFeedQuery, {
        variables: {
            authorization: tokens,
            search: deferredInput ? deferredInput : undefined,
            public: Constants.UseCriteriaPublic.TOKEN,
        },
        client,
    })
    const { ids, labelMap, disabled } = React.useMemo(() => {
        const ret: {
            ids: string[]
            labelMap: { [key: string]: { name: string; description: string } }
            disabled: Set<string>
        } = {
            ids: [],
            labelMap: {},
            disabled: new Set(),
        }
        if (!data) {
            return ret
        }
        for (const { node } of data.clusters.clusters.edges) {
            if (!node.id) {
                console.debug('invalid node', node)
            } else {
                if (
                    !node.availableActions.some((val: any) =>
                        _valid_set.has(val.type)
                    )
                ) {
                    ret.disabled.add(node.id)
                }
                ret.ids.push(node.id)
                if (node.name || node.description) {
                    ret.labelMap[node.id] = {
                        name: node.name,
                        description: node.description,
                    }
                }
            }
        }
        return ret
    }, [data])
    React.useLayoutEffect(() => {
        if (
            !firstIfEmpty ||
            ids.length == 0 ||
            !ids[0] ||
            props.form.values[props.field.name]
        ) {
            return
        }
        props.form.setFieldValue(props.field.name, ids[0])
    }, [ids.length ? ids[0] : ' '])
    return (
        <SimpleSelect
            {...props}
            loading={loading}
            getOptionDisabled={(option: string) => {
                return disabled.has(option)
            }}
            renderOption={(props, option: string) => {
                let roption = labelMap[option]
                let parsedId = option
                try {
                    parsedId = (fromGraphqlId(option) as [string, string])[1]
                } catch (e) {}
                if (roption && roption.name) {
                    return (
                        <li {...props} title={roption?.description || ''}>
                            <div>
                                <span style={{ maxWidth: '100%' }}>
                                    {roption.name}
                                </span>
                                <Typography
                                    component="span"
                                    sx={{
                                        paddingLeft: (theme) =>
                                            theme.spacing(1),
                                    }}
                                    variant="body2"
                                >
                                    {parsedId}
                                </Typography>
                            </div>
                        </li>
                    )
                } else {
                    return (
                        <li title={roption?.description || ''} {...props}>
                            {parsedId}
                        </li>
                    )
                }
            }}
            getOptionLabel={(option) => {
                let roption = labelMap[option]?.name
                if (!roption) {
                    try {
                        roption = (
                            fromGraphqlId(option) as [string, string]
                        )[1]
                    } catch (e) {
                        roption = option
                    }
                }
                return roption
            }}
            onInputChange={(event, newInputValue, reason) => {
                if (reason == 'input' && newInputValue != deferredInput) {
                    setInputValue(newInputValue)
                }
            }}
            options={ids}
        />
    )
}
