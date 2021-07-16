import { FieldProps } from 'formik'
import * as React from 'react'

import FormikTextField from '../../components/formik/FormikTextField'
import { contentStates } from '../../constants'
import { MapSelectProps, createOptionsIterator } from '../MapSelect'

export default function StateSelect<V extends string | string[] = string>(
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
