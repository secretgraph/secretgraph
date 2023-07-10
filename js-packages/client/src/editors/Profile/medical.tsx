import Grid from '@mui/material/Unstable_Grid2'
import { FastField, Field, useField } from 'formik'
import * as React from 'react'

import FormikDatePicker from '../../components/formik/FormikDatePicker'
import FormikTextField from '../../components/formik/FormikTextField'
import FormikTimePicker from '../../components/formik/FormikTimePicker'

type MedicalEntryData = {
    when: string
    what: string
}

const MedicalEntry = React.memo(function MedicalEntry({
    disabled,
    index,
    prefix,
}: {
    disabled: boolean
    index: number
    prefix: string
}) {
    return (
        <Grid container spacing={1}>
            <Grid xs={12} md={4}>
                <Field
                    name={`${prefix}.${index}.when`}
                    component={FormikDatePicker}
                    disabled={disabled}
                    clearable
                    label="When"
                    fullWidth
                />
            </Grid>
            <Grid xs={12} md={8}>
                <FastField
                    name={`${prefix}.${index}.what`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="Name"
                    multiline
                    fullWidth
                />
            </Grid>
        </Grid>
    )
})

const MedicalEntries = React.memo(function MedicalEntries({
    disabled,
    input,
    push,
    prefix,
}: {
    disabled: boolean
    input: MedicalEntryData[]
    push: (inp: MedicalEntryData) => void
    prefix: string
}) {
    const lastEntry = input.length
        ? input[input.length - 1]
        : {
              when: 'invalid',
          }
    React.useEffect(() => {
        if (!lastEntry.when) {
            return
        }
        push({
            when: '',
            what: '',
        })
    }, [lastEntry.when])
    return (
        <>
            {input.map((val, index) => (
                <MedicalEntry
                    prefix={prefix}
                    index={index}
                    disabled={disabled}
                    key={index}
                />
            ))}
        </>
    )
})
