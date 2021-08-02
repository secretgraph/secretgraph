import Checkbox, { CheckboxProps } from '@material-ui/core/Checkbox'
import { FieldProps, useField } from 'formik'
import * as React from 'react'

export type FormikCheckboxProps<V extends string = string, FormValues = any> =
    Omit<CheckboxProps, keyof FieldProps<V, FormValues>> &
        FieldProps<V, FormValues>

export default function FormikCheckbox<
    V extends string = string,
    FormValues = any
>({ field, meta, form, ...params }: FormikCheckboxProps<V, FormValues>) {
    return <Checkbox {...field} {...params} />
}
