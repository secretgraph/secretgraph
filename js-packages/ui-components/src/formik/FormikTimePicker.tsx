import { TimePicker, TimePickerProps } from '@mui/x-date-pickers/TimePicker'
import { parseISO } from 'date-fns'
import { FieldProps } from 'formik'
import * as React from 'react'

export type FormikTimePickerProps<
    V extends string = string,
    FormValues = any
> = Omit<
    TimePickerProps<Date>,
    keyof FieldProps<V, FormValues> | 'defaultValue' | 'onChange'
> &
    FieldProps<V, FormValues>

export default function FormikTimePicker<
    V extends string = string,
    FormValues = any
>({
    field: { value, ...field },
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
            value={value ? parseISO(value) : null}
            {...params}
            onChange={(val: any, context) => {
                if (val instanceof Date) {
                    // invalid dates
                    if (isNaN(val.getTime())) {
                        return
                    }
                    const hours = `${val.getHours()}`.padStart(2, '0')
                    const minutes = `${val.getMinutes()}`.padStart(2, '0')
                    form.setFieldValue(field.name, `${hours}:${minutes}`)
                } else {
                    form.setFieldValue(field.name, val)
                }
                form.setFieldTouched(field.name, true)
            }}
        />
    )
}