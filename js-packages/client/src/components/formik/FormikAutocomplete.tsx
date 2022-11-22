import Autocomplete, { AutocompleteProps } from '@mui/material/Autocomplete'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import {
    FieldHelperProps,
    FieldInputProps,
    FieldMetaProps,
    FieldProps,
    useField,
} from 'formik'
import * as React from 'react'

export function createOnChangeFn<
    T,
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
>(
    helpers: FieldHelperProps<
        AutocompleteValue<T, Multiple, DisableClearable, FreeSolo>
    >
) {
    return function onChangeFn(
        ...[event, value, reason, details]: Parameters<
            NonNullable<
                AutocompleteProps<
                    T,
                    Multiple,
                    DisableClearable,
                    FreeSolo
                >['onChange']
            >
        >
    ) {
        helpers.setValue(value)
    }
}
export type FormikAutocompleteProps<
    T,
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    FormValues = any
> = Omit<
    AutocompleteProps<T, Multiple, DisableClearable, FreeSolo>,
    Exclude<
        keyof FieldProps<
            AutocompleteValue<T, Multiple, DisableClearable, FreeSolo>,
            FormValues
        >,
        'onChange'
    >
> &
    FieldProps<
        AutocompleteValue<T, Multiple, DisableClearable, FreeSolo>,
        FormValues
    >

export default function FormikAutocomplete<
    T,
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    FormValues = any
>({
    onChange,
    field: { onChange: onFieldChange, ...field },
    form,
    ...params
}: FormikAutocompleteProps<
    T,
    Multiple,
    DisableClearable,
    FreeSolo,
    FormValues
>) {
    const helpers = form.getFieldHelpers(field.name)
    return (
        <Autocomplete
            {...field}
            {...params}
            onChange={onChange ?? createOnChangeFn(helpers)}
        />
    )
}