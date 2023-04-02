import Autocomplete, { AutocompleteProps } from '@mui/material/Autocomplete'
import { ChipTypeMap } from '@mui/material/Chip'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { FieldHelperProps, FieldProps } from 'formik'
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
    ChipComponent extends React.ElementType = ChipTypeMap['defaultComponent'],
    FormValues = any
> = Omit<
    AutocompleteProps<T, Multiple, DisableClearable, FreeSolo, ChipComponent>,
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
    ChipComponent extends React.ElementType = ChipTypeMap['defaultComponent'],
    FormValues = any
>({
    onChange,
    field: { onChange: onFieldChange, multiple, ...field },
    form,
    ...params
}: FormikAutocompleteProps<
    T,
    Multiple,
    DisableClearable,
    FreeSolo,
    ChipComponent,
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
