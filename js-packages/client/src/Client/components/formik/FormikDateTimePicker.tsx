import DateTimePicker, { DateTimePickerProps } from '@mui/lab/DateTimePicker'
import TextField from '@mui/material/TextField'
import { OptionalAttributes } from '@secretgraph/misc/typing'
import { FieldProps } from 'formik'
import * as React from 'react'

export type FormikDateTimePickerProps<
    V extends string | string[] = string,
    FormValues = any
> = OptionalAttributes<
    Omit<DateTimePickerProps, keyof FieldProps<V, FormValues> | 'defaultValue'>,
    'renderInput'
> &
    FieldProps<V, FormValues>

export default function FormikDateTimePicker<
    V extends string | string[] = string,
    FormValues = any
>({
    field,
    form,
    meta: metaIntern,
    renderInput,
    ...params
}: FormikDateTimePickerProps<V, FormValues>) {
    return (
        <DateTimePicker
            renderInput={
                renderInput ? renderInput : (props) => <TextField {...props} />
            }
            {...field}
            {...params}
        />
    )
}
