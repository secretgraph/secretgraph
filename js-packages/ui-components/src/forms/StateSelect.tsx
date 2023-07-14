import { useTheme } from '@mui/material/styles'
import { FieldProps } from 'formik'
import * as React from 'react'

import FormikTextField from '../formik/FormikTextField'
import { MapSelectProps, createOptionsIterator } from '../MapSelect'

declare module '@mui/material/styles' {
    interface Theme {
        contentStates: Map<string, { label: string }>
        contentStatesKey: Map<string, { label: string }>
    }
    interface ThemeOptions {
        contentStates: Map<string, { label: string }>
        contentStatesKey: Map<string, { label: string }>
    }
}

export default function StateSelect<V extends string | string[] = string>({
    forKey,
    ...props
}: Omit<MapSelectProps, 'options'> & FieldProps<V> & { forKey?: boolean }) {
    const theme = useTheme()
    return (
        <FormikTextField
            select
            SelectProps={{
                native: true,
            }}
            {...props}
        >
            {createOptionsIterator(
                forKey ? theme.contentStatesKey : theme.contentStates
            )}
        </FormikTextField>
    )
}
