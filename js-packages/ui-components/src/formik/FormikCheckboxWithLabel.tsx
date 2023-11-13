import Checkbox, { CheckboxProps } from '@mui/material/Checkbox'
import FormControlLabel, {
    FormControlLabelProps,
} from '@mui/material/FormControlLabel'
import { FieldProps, useField } from 'formik'
import * as React from 'react'

export type FormikCheckboxProps<FormValues = any> = Omit<
    CheckboxProps,
    keyof FieldProps<boolean, FormValues>
> &
    FieldProps<boolean, FormValues> & {
        Label: Omit<FormControlLabelProps, 'control'>
    }

export default function FormikCheckboxWithLabel<FormValues = any>({
    field,
    form,
    meta,
    Label,
    ...params
}: FormikCheckboxProps<FormValues>) {
    // make sure to specify type=checkbox in Field
    // checked is defined then
    return (
        <FormControlLabel
            control={<Checkbox {...field} {...params} />}
            {...Label}
        />
    )
}
