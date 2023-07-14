import Checkbox, { CheckboxProps } from '@mui/material/Checkbox'
import { FieldProps, useField } from 'formik'
import * as React from 'react'

export type FormikCheckboxProps<FormValues = any> = Omit<
    CheckboxProps,
    keyof FieldProps<boolean, FormValues>
> &
    FieldProps<boolean, FormValues>

export default function FormikCheckbox<FormValues = any>({
    field: { value, ...field },
    meta,
    form,
    ...params
}: FormikCheckboxProps<FormValues>) {
    return <Checkbox checked={value} {...field} {...params} />
}
