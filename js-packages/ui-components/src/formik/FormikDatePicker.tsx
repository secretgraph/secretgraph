import TextField, { TextFieldProps } from '@mui/material/TextField'
import { FieldProps } from 'formik'
import * as React from 'react'
import { ensureDateString } from '@secretgraph/misc/utils/misc'

export type FormikDatePickerProps<
    V extends string = string,
    FormValues = any
> = Omit<
    TextFieldProps,
    keyof FieldProps<V, FormValues> | 'onChange' | 'type'
> &
    FieldProps<V, FormValues> & {
        min?: Date | string
        max?: Date | string
    }

export default function FormikDatePicker<
    V extends string = string,
    FormValues = any
>({
    field: { value, ...field },
    form,
    meta: metaIntern,
    min,
    max,
    ...params
}: FormikDatePickerProps<V, FormValues>) {
    return (
        <TextField
            {...field}
            value={ensureDateString(value)}
            type="date"
            InputLabelProps={{
                ...params.InputLabelProps,
                shrink: true,
            }}
            inputProps={{
                ...params.inputProps,
                min: ensureDateString(min) || undefined,
                max: ensureDateString(max) || undefined,
            }}
            {...params}
        />
    )
}
