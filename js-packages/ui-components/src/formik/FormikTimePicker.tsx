import TextField, { TextFieldProps } from '@mui/material/TextField'
import { FieldProps } from 'formik'
import * as React from 'react'
import { ensureTimeString } from '@secretgraph/misc/utils/misc'

export type FormikTimePickerProps<
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

export default React.memo(function FormikTimePicker<
    V extends string = string,
    FormValues = any
>({
    field: { value, onChange, ...field },
    form,
    meta: metaIntern,
    min,
    max,
    ...params
}: FormikTimePickerProps<V, FormValues>) {
    return (
        <TextField
            {...field}
            value={ensureTimeString(value)}
            type="time"
            InputLabelProps={{
                ...params.InputLabelProps,
                shrink: true,
            }}
            inputProps={{
                ...params.inputProps,
                min: ensureTimeString(min) || undefined,
                max: ensureTimeString(max) || undefined,
            }}
            onChange={(ev) => {
                onChange(ev)
            }}
            {...params}
        />
    )
})
