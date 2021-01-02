import * as React from 'react'

import {
    AutocompleteRenderInputParams,
    AutocompleteProps,
} from '@material-ui/lab/Autocomplete'
import Chip from '@material-ui/core/Chip'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import { Autocomplete as FormikAutocomplete } from 'formik-material-ui-lab'

import { FieldProps, Field } from 'formik'

export interface SimpleSelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    V,
    T = string
> extends Omit<
        Omit<
            AutocompleteProps<T, Multiple, DisableClearable, FreeSolo>,
            'renderTags'
        >,
        'renderInput'
    > {
    name: string
    label?: TextFieldProps['label']
    InputProps?: TextFieldProps['InputProps']
    renderInput?: AutocompleteProps<
        T,
        Multiple,
        DisableClearable,
        FreeSolo
    >['renderInput']
    renderTags?:
        | true
        | AutocompleteProps<
              T,
              Multiple,
              DisableClearable,
              FreeSolo
          >['renderTags']
}

interface SimpleSelectPropsTags<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    V,
    T = string
> extends SimpleSelectProps<Multiple, DisableClearable, FreeSolo, V, T> {
    renderInput: AutocompleteProps<
        T,
        Multiple,
        DisableClearable,
        FreeSolo
    >['renderInput']
    renderTags: AutocompleteProps<
        T,
        Multiple,
        DisableClearable,
        FreeSolo
    >['renderTags']
}

interface SimpleSelectPropsTagsStrict<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    V,
    T = string
> extends SimpleSelectPropsTags<Multiple, DisableClearable, FreeSolo, V, T> {
    renderTags: NonNullable<
        AutocompleteProps<T, Multiple, DisableClearable, FreeSolo>['renderTags']
    >
}

export default function SimpleSelect<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    V,
    T = string
>({
    name,
    label,
    InputProps: InputPropsMain,
    ...appProps
}: SimpleSelectProps<Multiple, DisableClearable, FreeSolo, V, T>) {
    return (
        <Field name={name}>
            {(formikFieldProps: FieldProps<V>) => {
                if (appProps.renderTags === true) {
                    appProps.renderTags = (value, getTagProps) =>
                        value.map((option, index) => (
                            <Chip
                                variant="outlined"
                                label={
                                    appProps.getOptionLabel
                                        ? appProps.getOptionLabel(option)
                                        : option
                                }
                                size="small"
                                {...getTagProps({ index })}
                            />
                        ))
                }
                if (!appProps.renderInput) {
                    const getTagPropsDropin = ({
                        index,
                    }: {
                        index: number
                    }) => ({
                        key: index,
                        'data-tag-index': index,
                        tabIndex: -1,
                    })
                    appProps.renderInput = (
                        params: AutocompleteRenderInputParams
                    ) => {
                        const InputProps: TextFieldProps['InputProps'] = {
                            ...(InputPropsMain || {}),
                        }
                        Object.assign(InputProps, params.InputProps)
                        if (!appProps.multiple && appProps.renderTags) {
                            const appProps2 = appProps as SimpleSelectPropsTagsStrict<
                                Multiple,
                                DisableClearable,
                                FreeSolo,
                                V,
                                T
                            >
                            InputProps['startAdornment'] = appProps2.renderTags(
                                appProps.options,
                                getTagPropsDropin
                            )
                        }
                        return (
                            <TextField
                                {...params}
                                error={
                                    formikFieldProps.form.touched[name] &&
                                    !!formikFieldProps.form.errors[name]
                                }
                                InputProps={InputProps}
                                label={label}
                                fullWidth
                                helperText={formikFieldProps.form.errors[name]}
                                variant="outlined"
                            />
                        )
                    }
                }
                return (
                    <FormikAutocomplete
                        {...formikFieldProps}
                        {...(appProps as SimpleSelectPropsTags<
                            Multiple,
                            DisableClearable,
                            FreeSolo,
                            V,
                            T
                        >)}
                    />
                )
            }}
        </Field>
    )
}
