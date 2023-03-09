import TextField from '@mui/material/TextField'
import {
    DateTimePicker,
    DateTimePickerProps,
} from '@mui/x-date-pickers/DateTimePicker'
import { OptionalAttributes } from '@secretgraph/misc/typing'
import { FieldProps } from 'formik'
import * as React from 'react'

export type FormikDateTimePickerProps<
    V extends string = string,
    FormValues = any
> = Omit<
    DateTimePickerProps<string>,
    keyof FieldProps<V, FormValues> | 'defaultValue' | 'onChange'
> &
    FieldProps<V, FormValues>

export default function FormikDateTimePicker<
    V extends string = string,
    FormValues = any
>({
    field,
    form,
    meta: metaIntern,
    ampm,
    ...params
}: FormikDateTimePickerProps<V, FormValues>) {
    return (
        <DateTimePicker
            // TODO: use until code is fixed
            ampm={ampm !== undefined ? ampm : false}
            {...field}
            {...params}
            onChange={(val, context) => {
                form.setFieldValue(field.name, val)
                form.setFieldTouched(field.name, true)
            }}
        />
    )
}
