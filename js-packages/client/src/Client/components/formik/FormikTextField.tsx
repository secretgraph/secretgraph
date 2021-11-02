import TextField, { TextFieldProps } from '@mui/material/TextField'
import { FieldProps, useField } from 'formik'
import * as React from 'react'

export type FormikTextFieldProps<
    V extends string | string[] = string,
    FormValues = any
> = Omit<TextFieldProps, keyof FieldProps<V, FormValues> | 'defaultValue'> &
    FieldProps<V, FormValues>

export default function FormikTextField<
    V extends string | string[] = string,
    FormValues = any
>({
    field,
    form,
    meta: metaIntern,
    helperText,
    ...params
}: FormikTextFieldProps<V, FormValues>) {
    const meta = metaIntern ?? useField(field.name)[1]
    return (
        <TextField
            {...field}
            error={!!meta.error && meta.touched}
            helperText={meta.error && meta.touched ? meta.error : helperText}
            {...params}
        />
    )
}
