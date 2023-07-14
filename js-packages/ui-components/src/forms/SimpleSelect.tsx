import {
    AutocompleteProps,
    AutocompleteRenderInputParams,
} from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import { AutocompleteValue } from '@mui/material/useAutocomplete'
import { Field, FieldInputProps, FieldMetaProps, FieldProps } from 'formik'
import * as React from 'react'

import FormikAutocomplete from '../formik/FormikAutocomplete'
import FormikTextField from '../formik/FormikTextField'

export interface SimpleSelectProps<
    T,
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends Omit<
        AutocompleteProps<T, Multiple, DisableClearable, FreeSolo>,
        'renderTags' | 'renderInput'
    > {
    label?: TextFieldProps['label']
    helperText?: TextFieldProps['helperText']
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
    T,
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends SimpleSelectProps<T, Multiple, DisableClearable, FreeSolo> {
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
    T,
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
> extends SimpleSelectPropsTags<T, Multiple, DisableClearable, FreeSolo> {
    renderTags: NonNullable<
        AutocompleteProps<
            T,
            Multiple,
            DisableClearable,
            FreeSolo
        >['renderTags']
    >
}

export default function SimpleSelect<
    T,
    Multiple extends boolean | undefined,
    DisableClearable extends boolean | undefined,
    FreeSolo extends boolean | undefined
>({
    label,
    InputProps: InputPropsMain,
    field,
    form,
    meta,
    ...appProps
}: SimpleSelectProps<T, Multiple, DisableClearable, FreeSolo> &
    FieldProps<AutocompleteValue<T, Multiple, DisableClearable, FreeSolo>>) {
    if (!appProps.getOptionLabel) {
        appProps.getOptionLabel = (option: T) => `${option}`
    }
    if (appProps.renderTags === true) {
        appProps.renderTags = (value, getTagProps, ownerState) =>
            value.map((option, index) => {
                return (
                    <Chip
                        variant="outlined"
                        label={(
                            appProps.getOptionLabel as NonNullable<
                                (typeof appProps)['getOptionLabel']
                            >
                        )(option)}
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
            tabIndex: -1 as const,
            className: appProps?.classes?.tag ? appProps.classes.tag : '',
            disabled: !!appProps.disabled,
            onDelete: () => {
                if (field.value instanceof Array) {
                    const newValue = field.value.slice()
                    newValue.splice(index, 1)
                    form.setFieldValue(field.name, newValue)
                } else {
                    form.setFieldValue(field.name, null)
                }
            },
        })
        appProps.renderInput = (params: AutocompleteRenderInputParams) => {
            const InputProps: TextFieldProps['InputProps'] = {
                ...(InputPropsMain || {}),
            }
            Object.assign(InputProps, params.InputProps)
            /**if (!appProps.multiple && appProps.renderTags) {
                const appProps2 = appProps as SimpleSelectPropsTagsStrict<
                    T,
                    Multiple,
                    DisableClearable,
                    FreeSolo
                >
                InputProps['startAdornment'] = appProps2.renderTags(
                    appProps.options as T[],
                    getTagPropsDropin,
                    {...params, options: appProps.options}
                )
            }*/
            return (
                <TextField
                    {...params}
                    error={!!meta?.error && meta?.touched}
                    helperText={
                        meta?.error && meta?.touched
                            ? meta.error
                            : appProps.helperText
                    }
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
                T,
                Multiple,
                DisableClearable,
                FreeSolo
            >)}
            field={field}
            meta={meta}
            form={form}
        />
    )
}
