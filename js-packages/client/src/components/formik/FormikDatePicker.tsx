import { DatePicker, DatePickerProps } from '@mui/x-date-pickers/DatePicker'
import { parseISO } from 'date-fns'
import { FieldProps } from 'formik'
import * as React from 'react'

export type FormikDateTimePickerProps<
    V extends string = string,
    FormValues = any
> = Omit<
    DatePickerProps<Date>,
    keyof FieldProps<V, FormValues> | 'defaultValue' | 'onChange'
> &
    FieldProps<V, FormValues>

export default function FormikDatePicker<
    V extends string = string,
    FormValues = any
>({
    field: { value, ...field },
    form,
    meta: metaIntern,
    ...params
}: FormikDateTimePickerProps<V, FormValues>) {
    return (
        <DatePicker
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
