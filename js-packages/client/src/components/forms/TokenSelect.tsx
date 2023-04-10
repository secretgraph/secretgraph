import { ApolloClient, useQuery } from '@apollo/client'
import Typography from '@mui/material/Typography'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { clusterFeedQuery } from '@secretgraph/graphql-queries/cluster'
import * as Constants from '@secretgraph/misc/constants'
import { Field, FieldProps } from 'formik'
import * as React from 'react'

import SimpleSelect, { SimpleSelectProps } from './SimpleSelect'

export interface TokenSelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined
> extends Omit<
        SimpleSelectProps<string, Multiple, DisableClearable, true>,
        'options' | 'getOptionLabel' | 'loading' | 'freeSolo'
    > {
    tokens: string[]
}

export default function TokenSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined
>({
    tokens,
    ...props
}: TokenSelectProps<Multiple, DisableClearable> &
    FieldProps<AutocompleteValue<string, Multiple, DisableClearable, true>>) {
    const tokensFinished = React.useMemo(() => {
        return [...tokens, 'new']
    }, [tokens])
    return (
        <SimpleSelect
            {...props}
            freeSolo
            options={tokensFinished}
            onChange={(
                ev: any,
                val: AutocompleteValue<
                    string,
                    Multiple,
                    DisableClearable,
                    true
                >
            ) => {
                if (typeof val == 'string') {
                    if (val == 'new') {
                        props.form.setFieldValue(
                            props.field.name,
                            Buffer.from(
                                crypto.getRandomValues(new Uint8Array(32))
                            ).toString('base64')
                        )
                    } else {
                        props.form.setFieldValue(props.field.name, val)
                    }
                } else if (val) {
                    props.form.setFieldValue(
                        props.field.name,
                        val.map((v) => {
                            if (v == 'new') {
                                return Buffer.from(
                                    crypto.getRandomValues(new Uint8Array(32))
                                ).toString('base64')
                            } else {
                                return v
                            }
                        })
                    )
                } else {
                    props.form.setFieldValue(props.field.name, val)
                }
            }}
            renderOption={(
                props: React.HTMLAttributes<HTMLLIElement>,
                val: string
            ) => {
                if (val == 'new') {
                    return (
                        <li {...props}>
                            <Typography style={{ color: 'green' }}>
                                {val}
                            </Typography>
                        </li>
                    )
                }
                return <li {...props}>{val}</li>
            }}
        />
    )
}
