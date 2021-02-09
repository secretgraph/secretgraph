import * as React from 'react'

import { Field } from 'formik'
import { TextField as FormikTextField } from 'formik-material-ui'

import { MapSelectProps, createOptionsIterator } from '../MapSelect'
import { contentStates } from '../../constants'

export default function ({
    disabled,
    name,
    ...props
}: { name: string } & Omit<MapSelectProps, 'options'>) {
    return (
        <Field
            component={FormikTextField}
            name={name}
            select
            SelectProps={{
                native: true,
            }}
            {...props}
            children={createOptionsIterator(contentStates)}
        />
    )
}
