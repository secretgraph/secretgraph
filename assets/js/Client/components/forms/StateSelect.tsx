import { FieldProps } from 'formik'
import { TextField as FormikTextField } from 'formik-material-ui'
import * as React from 'react'

import { contentStates } from '../../constants'
import { MapSelectProps, createOptionsIterator } from '../MapSelect'

export default function StateSelect<V = any>(
    props: Omit<MapSelectProps, 'options'> & FieldProps<V>
) {
    return (
        <FormikTextField
            select
            SelectProps={{
                native: true,
            }}
            {...props}
        >
            {createOptionsIterator(contentStates)}
        </FormikTextField>
    )
}
