import { useTheme } from '@mui/material/styles'
import { contentStates } from '@secretgraph/misc/constants'
import { FieldProps } from 'formik'
import * as React from 'react'

import FormikTextField from '../formik/FormikTextField'
import { MapSelectProps, createOptionsIterator } from '../MapSelect'

export default function StateSelect<V extends string | string[] = string>(
    props: Omit<MapSelectProps, 'options'> & FieldProps<V>
) {
    const theme = useTheme()
    return (
        <FormikTextField
            select
            SelectProps={{
                native: true,
            }}
            {...props}
        >
            {createOptionsIterator(theme.contentStates)}
        </FormikTextField>
    )
}
