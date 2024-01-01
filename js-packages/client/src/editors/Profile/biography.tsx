import { Typography } from '@mui/material'
import Grid from '@mui/material/Unstable_Grid2'
import FormikDatePicker from '@secretgraph/ui-components/formik/FormikDatePicker'
import FormikTextField from '@secretgraph/ui-components/formik/FormikTextField'
import FormikTimePicker from '@secretgraph/ui-components/formik/FormikTimePicker'
import {
    FastField,
    Field,
    FieldArray,
    FieldArrayRenderProps,
    useField,
} from 'formik'
import * as React from 'react'

export type AchievementEntryData = {
    when: string
    what: string
    link: string
}

const AchievementEntry = React.memo(function AchievementEntry({
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

export const AchievementEntries = React.memo(function AchievementEntries({
    disabled,
    input,
    push,
    prefix,
}: {
    disabled: boolean
    input: AchievementEntryData[]
    push: (inp: AchievementEntryData) => void
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
                <AchievementEntry
                    prefix={prefix}
                    index={index}
                    disabled={disabled}
                    key={index}
                />
            ))}
        </>
    )
})

export type BioEntryData = {
    start: string
    stop: string
    what: string
}

export const BioEntry = React.memo(function BioEntry({
    disabled,
    index,
    prefix,
    achievementName,
    achievementLabel,
}: {
    disabled: boolean
    index: number
    prefix: string
    achievementName?: string
    achievementLabel?: string
}) {
    const { value: minTime } = useField(`${prefix}.${index}.start`)[0]
    const { value: maxTime } = useField(`${prefix}.${index}.stop`)[0]

    return (
        <Grid container spacing={1}>
            <Grid xs={12} sm={6}>
                <Field
                    name={`${prefix}.${index}.start`}
                    component={FormikDatePicker}
                    max={maxTime}
                    disabled={disabled}
                    label="Start"
                    fullWidth
                />
            </Grid>
            <Grid xs={12} sm={6}>
                <Field
                    name={`${prefix}.${index}.stop`}
                    component={FormikTimePicker}
                    min={minTime}
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
            {achievementName && achievementLabel ? (
                <Grid xs={12}>
                    <Typography variant="h4">{achievementLabel}</Typography>
                    <FieldArray name={`${prefix}.${index}.${achievementName}`}>
                        {({ push, form, name }: FieldArrayRenderProps) => (
                            <AchievementEntries
                                disabled={disabled}
                                push={push}
                                prefix={name}
                                input={form.values[name]}
                            />
                        )}
                    </FieldArray>
                </Grid>
            ) : null}
        </Grid>
    )
})

export const BioEntries = React.memo(function BioEntries({
    disabled,
    input,
    push,
    prefix,
    achievementName,
    achievementLabel,
}: {
    disabled: boolean
    input: BioEntryData[]
    push: (inp: BioEntryData) => void
    prefix: string
    achievementName?: string
    achievementLabel?: string
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
                    achievementName={achievementName}
                    achievementLabel={achievementLabel}
                />
            ))}
        </>
    )
})

export default React.memo(function BiographyBlock({
    disabled,
}: {
    disabled: boolean
}) {
    return (
        <details>
            <summary
                style={{
                    whiteSpace: 'nowrap',
                    paddingRight: '4px',
                }}
            >
                <span
                    style={{
                        display: 'inline-block',
                    }}
                >
                    Biography
                </span>
            </summary>
            <Grid container spacing={1}>
                <Grid xs={12} md={6}>
                    <Typography variant="h4">Education</Typography>
                    <FieldArray name="education">
                        {({ push, form, name }: FieldArrayRenderProps) => (
                            <BioEntries
                                disabled={disabled}
                                push={push}
                                prefix={name}
                                input={form.values[name]}
                                achievementName="achievements"
                                achievementLabel="Achievements"
                            />
                        )}
                    </FieldArray>
                </Grid>
                <Grid xs={12} md={6}>
                    <Typography variant="h4">Work</Typography>
                    <FieldArray name="work">
                        {({ push, form, name }: FieldArrayRenderProps) => (
                            <BioEntries
                                disabled={disabled}
                                push={push}
                                prefix={name}
                                input={form.values[name]}
                                achievementName="achievements"
                                achievementLabel="Achievements"
                            />
                        )}
                    </FieldArray>
                </Grid>

                <Grid xs={12} md={6}>
                    <Typography variant="h4">Achievements</Typography>
                    <FieldArray name="achievements">
                        {({ push, form, name }: FieldArrayRenderProps) => (
                            <AchievementEntries
                                disabled={disabled}
                                push={push}
                                prefix={name}
                                input={form.values[name]}
                            />
                        )}
                    </FieldArray>
                </Grid>
                <Grid xs={12} md={6}>
                    <Typography variant="h4">Projects</Typography>
                    <FieldArray name="projects">
                        {({ push, form, name }: FieldArrayRenderProps) => (
                            <BioEntries
                                disabled={disabled}
                                push={push}
                                prefix={name}
                                input={form.values[name]}
                                achievementName="achievements"
                                achievementLabel="Achievements"
                            />
                        )}
                    </FieldArray>
                </Grid>
            </Grid>
        </details>
    )
})
