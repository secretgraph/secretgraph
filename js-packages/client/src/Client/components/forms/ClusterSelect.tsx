import { useQuery } from '@apollo/client'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import { authInfoFromConfig } from '@secretgraph/misc/utils/config'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

import { InitializedConfig } from '../../contexts'
import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

export interface ClusterSelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends Omit<
        SimpleSelectProps<string, Multiple, DisableClearable, FreeSolo>,
        'options' | 'getOptionLabel' | 'loading'
    > {
    url: string
    firstIfEmpty?: boolean
    tokens: string[]
}

export default function ClusterSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
>({
    url,
    firstIfEmpty,
    tokens,
    ...props
}: ClusterSelectProps<Multiple, DisableClearable, FreeSolo> &
    FieldProps<
        AutocompleteValue<string, Multiple, DisableClearable, FreeSolo>
    >) {
    const [inputValue, setInputValue] = React.useState('')
    const { fetchMore, data, loading } = useQuery(clusterFeedQuery, {
        variables: {
            authorization: tokens,
            search: inputValue ? inputValue : undefined,
        },
    })
    const { ids, labelMap } = React.useMemo(() => {
        const ret: {
            ids: string[]
            labelMap: { [key: string]: { name: string; description: string } }
        } = {
            ids: [],
            labelMap: {},
        }
        if (!data) {
            return ret
        }
        for (const { node } of data.clusters.clusters.edges) {
            if (!node.id) {
                console.debug('invalid node', node)
            } else {
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
    React.useEffect(() => {
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
            getOptionLabel={(option) => {
                return labelMap[option]?.name || option
            }}
            options={ids}
        />
    )
}
