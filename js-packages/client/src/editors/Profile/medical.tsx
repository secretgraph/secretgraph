import Grid from '@mui/material/Grid2'
import FormikDatePicker from '@secretgraph/ui-components/formik/FormikDatePicker'
import FormikTextField from '@secretgraph/ui-components/formik/FormikTextField'
import FormikTimePicker from '@secretgraph/ui-components/formik/FormikTimePicker'
import { FastField, Field, useField } from 'formik'
import * as React from 'react'

export type MedicalEntryData = {
    when: string
    what: string
}

export const MedicalEntry = React.memo(function MedicalEntry({
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
            <Grid size={{ xs: 12, md: 4 }}>
                <Field
                    name={`${prefix}.${index}.when`}
                    component={FormikDatePicker}
                    disabled={disabled}
                    label="When"
                    fullWidth
                />
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
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

export const MedicalEntries = React.memo(function MedicalEntries({
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
