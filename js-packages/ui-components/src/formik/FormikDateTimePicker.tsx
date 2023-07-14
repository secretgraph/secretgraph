import TextField from '@mui/material/TextField'
import {
    DateTimePicker,
    DateTimePickerProps,
} from '@mui/x-date-pickers/DateTimePicker'
import { parseISO } from 'date-fns'
import { FieldProps } from 'formik'
import * as React from 'react'

export type FormikDateTimePickerProps<
    V extends string = string,
    FormValues = any
> = Omit<
    DateTimePickerProps<Date>,
    keyof FieldProps<V, FormValues> | 'defaultValue' | 'onChange'
> &
    FieldProps<V, FormValues>

export default function FormikDateTimePicker<
    V extends string = string,
    FormValues = any
>({
    field: { value, ...field },
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
            value={value ? parseISO(value) : null}
            {...params}
            onChange={(val: Date, context) => {
                if (val instanceof Date) {
                    // invalid dates
                    if (isNaN(val.getTime())) {
                        return
                    }
                    form.setFieldValue(field.name, val.toISOString())
                } else {
                    form.setFieldValue(field.name, val)
                }
                form.setFieldTouched(field.name, true)
            }}
        />
    )
}
