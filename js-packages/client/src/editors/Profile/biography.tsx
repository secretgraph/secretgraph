import Grid from '@mui/material/Unstable_Grid2'
import { FastField, Field, useField } from 'formik'
import * as React from 'react'

import FormikDatePicker from '../../components/formik/FormikDatePicker'
import FormikTextField from '../../components/formik/FormikTextField'
import FormikTimePicker from '../../components/formik/FormikTimePicker'

export type BioEntryData = {
    start: string
    stop: string
    what: string
}

const BioEntry = React.memo(function BioEntry({
    disabled,
    index,
    prefix,
}: {
    disabled: boolean
    index: number
    prefix: string
}) {
    const { value: minTime } = useField(`${prefix}.${index}.start`)[0]
    const { value: maxTime } = useField(`${prefix}.${index}.stop`)[0]

    return (
        <Grid container spacing={1}>
            <Grid xs={12} sm={6}>
                <Field
                    name={`${prefix}.${index}.start`}
                    component={FormikDatePicker}
                    maxTime={maxTime}
                    disabled={disabled}
                    clearable
                    label="Start"
                    fullWidth
                />
            </Grid>
            <Grid xs={12} sm={6}>
                <Field
                    name={`${prefix}.${index}.stop`}
                    component={FormikTimePicker}
                    minTime={minTime}
                    clearable
                    showTodayButton
                    disabled={disabled}
                    label="Stop"
                    fullWidth
                />
            </Grid>
            <Grid xs={12}>
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

const BioEntries = React.memo(function BioEntries({
    disabled,
    input,
    push,
    prefix,
}: {
    disabled: boolean
    input: BioEntryData[]
    push: (inp: BioEntryData) => void
    prefix: string
}) {
    const lastEntry = input.length
        ? input[input.length - 1]
        : {
              start: 'invalid',
              stop: 'invalid',
          }
    React.useEffect(() => {
        if (!lastEntry.start || !lastEntry.stop) {
            return
        }
        push({
            start: '',
            stop: '',
            what: '',
        })
    }, [lastEntry.start, lastEntry.stop])
    return (
        <>
            {input.map((val, index) => (
                <BioEntry
                    prefix={prefix}
                    index={index}
                    disabled={disabled}
                    key={index}
                />
            ))}
        </>
    )
})

export type AwardEntryData = {
    when: string
    what: string
    link: string
}

const AwardEntry = React.memo(function AwardEntry({
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
                    label="What"
                    multiline
                    fullWidth
                />
            </Grid>
            <Grid xs={12}>
                <FastField
                    name={`${prefix}.${index}.link`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="Link"
                    fullWidth
                />
            </Grid>
        </Grid>
    )
})

export const AwardEntries = React.memo(function AwardEntries({
    disabled,
    input,
    push,
    prefix,
}: {
    disabled: boolean
    input: AwardEntryData[]
    push: (inp: AwardEntryData) => void
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
            link: '',
        })
    }, [lastEntry.when])
    return (
        <>
            {input.map((val, index) => (
                <AwardEntry
                    prefix={prefix}
                    index={index}
                    disabled={disabled}
                    key={index}
                />
            ))}
        </>
    )
})
