import TextField from '@mui/material/TextField'
import { TimePicker, TimePickerProps } from '@mui/x-date-pickers/TimePicker'
import { OptionalAttributes } from '@secretgraph/misc/typing'
import { format } from 'date-fns'
import { FieldProps } from 'formik'
import * as React from 'react'

export type FormikTimePickerProps<
    V extends string = string,
    FormValues = any
> = Omit<
    TimePickerProps<string>,
    keyof FieldProps<V, FormValues> | 'defaultValue' | 'onChange'
> &
    FieldProps<V, FormValues>

export default function FormikTimePicker<
    V extends string = string,
    FormValues = any
>({
    field,
    form,
    meta: metaIntern,
    ampm,
    ...params
}: FormikTimePickerProps<V, FormValues>) {
    return (
        <TimePicker
            // TODO: use until code is fixed
            ampm={ampm !== undefined ? ampm : false}
            {...field}
            {...params}
            onChange={(val: any, context) => {
                if (val instanceof Date) {
                    // invalid dates
                    if (isNaN(val.getTime())) {
                        return
                    }
                    val = format(val, 'HH:mm')
                }
                form.setFieldValue(field.name, val as string)
                form.setFieldTouched(field.name, true)
            }}
        />
    )
}
