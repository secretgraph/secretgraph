import Typography from '@mui/material/Typography'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { hashObject, hashToken } from '@secretgraph/misc/utils/hashing'
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
    tokens?: string[]
    hashAlgorithm?: string
    updateHashField?: string
}

export default function TokenSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined
>({
    tokens = [],
    hashAlgorithm,
    updateHashField,
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
            onChange={async (
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
                        const res = crypto.getRandomValues(new Uint8Array(50))
                        if (hashAlgorithm && updateHashField) {
                            props.form.setFieldValue(
                                updateHashField,
                                await hashToken(res, hashAlgorithm),
                                false
                            )
                        }
                        ;-props.form.setFieldValue(
                            props.field.name,
                            Buffer.from(res).toString('base64'),
                            false
                        )
                    } else {
                        if (hashAlgorithm && updateHashField) {
                            props.form.setFieldValue(
                                updateHashField,
                                await hashToken(val, hashAlgorithm),
                                false
                            )
                        }
                        ;-props.form.setFieldValue(props.field.name, val)
                    }
                } else if (val) {
                    const ret = val.map((v) => {
                        if (v == 'new') {
                            return Buffer.from(
                                crypto.getRandomValues(new Uint8Array(50))
                            ).toString('base64')
                        } else {
                            return v
                        }
                    })

                    if (hashAlgorithm && updateHashField) {
                        props.form.setFieldValue(
                            updateHashField,
                            await Promise.all(
                                ret.map((val) => hashToken(val, hashAlgorithm))
                            ),
                            false
                        )
                    }
                    ;-props.form.setFieldValue(props.field.name, ret)
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
