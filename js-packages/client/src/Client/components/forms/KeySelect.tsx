import { ApolloClient, useQuery } from '@apollo/client'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { contentFeedQuery } from '@secretgraph/graphql-queries/content'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

export interface KeySelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends Omit<
        SimpleSelectProps<string, Multiple, DisableClearable, FreeSolo>,
        'options' | 'getOptionLabel' | 'loading'
    > {
    client?: ApolloClient<any>
    cluster?: string
    type?: 'PrivateKey' | 'PublicKey'
    tokens: string[]
    firstIfEmpty?: boolean
}

export default function KeySelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
>({
    client,
    cluster,
    type = 'PublicKey',
    tokens,
    firstIfEmpty,
    ...props
}: KeySelectProps<Multiple, DisableClearable, FreeSolo> &
    FieldProps<
        AutocompleteValue<string, Multiple, DisableClearable, FreeSolo>
    >) {
    const [inputValue, setInputValue] = React.useState('')
    const deferredInput = React.useDeferredValue(inputValue)
    const { data, loading } = useQuery(contentFeedQuery, {
        variables: {
            clusters: cluster ? [cluster] : null,
            authorization: tokens,
            includeTags: deferredInput
                ? [`name=${deferredInput}`, `key_hash=${deferredInput}`]
                : ['name=', 'key_hash='],
            includeTypes: [type],
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
        for (const { node } of data.contents.contents.edges) {
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
