import { ApolloClient, useQuery } from '@apollo/client'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

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
                if (node.name) {
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
            getOptionDisabled={(option) => {
                return disabled.has(option)
            }}
            getOptionLabel={(option) => {
                return labelMap[option]?.name || option
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
