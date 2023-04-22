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
    field: { value, ...field },
    form,
    meta,
    Label,
    ...params
}: FormikCheckboxProps<FormValues>) {
    return (
        <FormControlLabel
            control={<Checkbox checked={value} {...field} {...params} />}
            {...Label}
        />
    )
}
