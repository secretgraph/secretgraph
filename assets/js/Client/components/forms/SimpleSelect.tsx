import * as React from 'react'

import {
    AutocompleteRenderInputParams,
    AutocompleteProps,
} from '@material-ui/lab/Autocomplete'
import Chip from '@material-ui/core/Chip'
import TextField, { TextFieldProps } from '@material-ui/core/TextField'
import { TextField as FormikTextField } from 'formik-material-ui'

import { Autocomplete as FormikAutocomplete } from 'formik-material-ui-lab'

import { FieldProps, Field } from 'formik'

export interface SimpleSelectProps<
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined,
    T = string
> extends Omit<
        AutocompleteProps<T, Multiple, DisableClearable, FreeSolo>,
        'renderTags' | 'renderInput'
    > {
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
    T = string
> extends SimpleSelectProps<Multiple, DisableClearable, FreeSolo, T> {
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
    T = string
> extends SimpleSelectPropsTags<Multiple, DisableClearable, FreeSolo, T> {
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
    label,
    InputProps: InputPropsMain,
    field,
    form,
    meta,
    ...appProps
}: SimpleSelectProps<Multiple, DisableClearable, FreeSolo, T> & FieldProps<V>) {
    if (!appProps.getOptionLabel) {
        appProps.getOptionLabel = (option: T) => `${option}`
    }
    if (appProps.renderTags === true) {
        appProps.renderTags = (value, getTagProps) =>
            value.map((option, index) => {
                return (
                    <Chip
                        variant="outlined"
                        label={(appProps.getOptionLabel as NonNullable<
                            typeof appProps['getOptionLabel']
                        >)(option)}
                        size="small"
                        {...getTagProps({ index })}
                    />
                )
            })
    }
    if (!appProps.renderInput) {
        const getTagPropsDropin = ({ index }: { index: number }) => ({
            key: index,
            'data-tag-index': index,
            tabIndex: -1,
        })
        appProps.renderInput = (params: AutocompleteRenderInputParams) => {
            const InputProps: TextFieldProps['InputProps'] = {
                ...(InputPropsMain || {}),
            }
            Object.assign(InputProps, params.InputProps)
            if (!appProps.multiple && appProps.renderTags) {
                const appProps2 = appProps as SimpleSelectPropsTagsStrict<
                    Multiple,
                    DisableClearable,
                    FreeSolo,
                    T
                >
                InputProps['startAdornment'] = appProps2.renderTags(
                    appProps.options,
                    getTagPropsDropin
                )
            }
            return (
                <FormikTextField
                    {...params}
                    field={field}
                    form={form}
                    meta={meta}
                    InputProps={InputProps}
                    label={label}
                    fullWidth
                    variant="outlined"
                />
            )
        }
    }
    return (
        <FormikAutocomplete
            {...(appProps as SimpleSelectPropsTags<
                Multiple,
                DisableClearable,
                FreeSolo,
                T
            > &
                FieldProps<V>)}
        />
    )
}
