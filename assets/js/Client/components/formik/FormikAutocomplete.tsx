import Autocomplete, { AutocompleteProps } from '@material-ui/lab/Autocomplete'
import { Value } from '@material-ui/lab/useAutocomplete'
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
    field: Pick<
        FieldInputProps<Value<T, Multiple, DisableClearable, FreeSolo>>,
        'multiple' | 'value'
    >,
    helpers: FieldHelperProps<Value<T, Multiple, DisableClearable, FreeSolo>>
) {
    return function onChangeFn(
        ...[event, value, reason]: Parameters<
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
        if (field.multiple) {
            switch (reason) {
                case 'blur':
                case 'select-option':
                    helpers.setValue(value)
                    break
                case 'create-option':
                    helpers.setValue([
                        ...(field.value as T[]),
                        value as T,
                    ] as any)
                    break
                case 'remove-option':
                    helpers.setValue(
                        (field.value as T[]).filter(
                            (val) => val != value
                        ) as any
                    )
                    break
            }
        } else {
            switch (reason) {
                case 'blur':
                case 'select-option':
                case 'create-option':
                    helpers.setValue(value)
                    break
                case 'remove-option':
                    helpers.setValue(null as any)
                    break
            }
        }
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
            Value<T, Multiple, DisableClearable, FreeSolo>,
            FormValues
        >,
        'onChange'
    >
> &
    FieldProps<Value<T, Multiple, DisableClearable, FreeSolo>, FormValues>

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
            onChange={onChange ?? createOnChangeFn(field, helpers)}
        />
    )
}
