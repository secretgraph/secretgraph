import * as React from 'react'

import { Field, FieldProps } from 'formik'
import { TextField as FormikTextField } from 'formik-material-ui'

import MapSelect, { MapSelectProps, createOptionsIterator } from '../MapSelect'
import { contentStates } from '../../constants'

export default function StateSelect<V = any>(
    props: Omit<MapSelectProps, 'options'> & FieldProps<V>
) {
    return (
        <FormikTextField
            select
            SelectProps={{
                native: true,
            }}
            children={createOptionsIterator(contentStates)}
            {...props}
        />
    )
}
