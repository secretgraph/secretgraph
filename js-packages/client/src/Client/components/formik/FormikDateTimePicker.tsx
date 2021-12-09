import DateTimePicker, { DateTimePickerProps } from '@mui/lab/DateTimePicker'
import TextField from '@mui/material/TextField'
import { OptionalAttributes } from '@secretgraph/misc/typing'
import { FieldProps } from 'formik'
import * as React from 'react'

export type FormikDateTimePickerProps<
    V extends string | string[] = string,
    FormValues = any
> = OptionalAttributes<
    Omit<
        DateTimePickerProps<string>,
        keyof FieldProps<V, FormValues> | 'defaultValue' | 'onChange'
    >,
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
    ampm,
    inputFormat,
    mask,
    ...params
}: FormikDateTimePickerProps<V, FormValues>) {
    return (
        <DateTimePicker
            renderInput={
                renderInput ? renderInput : (props) => <TextField {...props} />
            }
            inputFormat={inputFormat ? inputFormat : 'yyyy-MM-dd hh:mm'}
            mask={mask ? mask : '____-__-__ __:__'}
            // TODO: use until code is fixed
            ampm={ampm !== undefined ? ampm : false}
            {...field}
            {...params}
            onChange={(val) => {
                form.setFieldValue(field.name, val)
                form.setFieldTouched(field.name, true)
            }}
        />
    )
}
