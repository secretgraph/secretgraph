import Checkbox, { CheckboxProps } from '@mui/material/Checkbox'
import FormControlLabel, {
    FormControlLabelProps,
} from '@mui/material/FormControlLabel'
import { FieldProps, useField } from 'formik'
import * as React from 'react'

export type FormikCheckboxProps<
    V extends string = string,
    FormValues = any
> = Omit<CheckboxProps, keyof FieldProps<V, FormValues>> &
    FieldProps<V, FormValues> & {
        Label: Omit<FormControlLabelProps, 'control'>
    }

export default function FormikCheckboxWithLabel<
    V extends string = string,
    FormValues = any
>({ field, form, meta, Label, ...params }: FormikCheckboxProps<V, FormValues>) {
    return (
        <FormControlLabel
            control={<Checkbox {...field} {...params} />}
            {...Label}
        />
    )
}
