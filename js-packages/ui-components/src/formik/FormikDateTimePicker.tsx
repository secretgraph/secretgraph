import TextField, { TextFieldProps } from '@mui/material/TextField'
import { FieldProps } from 'formik'
import * as React from 'react'
import { ensureDateTimeString } from '@secretgraph/misc/utils/misc'

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
            value={ensureDateTimeString(value)}
            type="datetime-local"
            inputProps={{
                ...params.inputProps,
                min: ensureDateTimeString(min) || undefined,
                max: ensureDateTimeString(max) || undefined,
            }}
            {...params}
        />
    )
}
