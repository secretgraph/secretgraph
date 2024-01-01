import Grid from '@mui/material/Unstable_Grid2'
import FormikCheckboxWithLabel from '@secretgraph/ui-components/formik/FormikCheckboxWithLabel'
import FormikDatePicker from '@secretgraph/ui-components/formik/FormikDatePicker'
import FormikTextField from '@secretgraph/ui-components/formik/FormikTextField'
import FormikTimePicker from '@secretgraph/ui-components/formik/FormikTimePicker'
import {
    FastField,
    Field,
    FieldArray,
    FieldArrayRenderProps,
    useField,
    useFormikContext,
} from 'formik'
import * as React from 'react'

export type AddressEntryData = {
    id?: string
    deletion?: Date | true
    start: string
    stop: string
    addressline: string
    city: string
    zipcode: string
    country: string
    primary: boolean
}

export const AddressEntry = React.memo(function AddressEntry({
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
            <Grid container spacing={1} xs>
                <Grid xs={12} sm={6}>
                    <Field
                        name={`${prefix}.${index}.start`}
                        component={FormikDatePicker}
                        nax={maxTime}
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
            </Grid>
            <Grid xs={1}>
                <FastField
                    name={`${prefix}.${index}.primary`}
                    component={FormikCheckboxWithLabel}
                    disabled={disabled}
                    Label={{ label: 'Primary' }}
                    type="checkbox"
                />
            </Grid>
            <Grid xs={12}>
                <FastField
                    name={`${prefix}.${index}.addressline`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="Address"
                    fullWidth
                />
            </Grid>
            <Grid xs={12} sm={6}>
                <FastField
                    name={`${prefix}.${index}.city`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="City"
                    fullWidth
                    validate={(val: string) => (val ? null : 'Empty')}
                />
            </Grid>
            <Grid xs={12} sm={3}>
                <FastField
                    name={`${prefix}.${index}.zipcode`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="Zipcode"
                    fullWidth
                    validate={(val: string) => (val ? null : 'Empty')}
                />
            </Grid>
            <Grid xs={12} sm={3}>
                <FastField
                    name={`${prefix}.${index}.country`}
                    component={FormikTextField}
                    disabled={disabled}
                    label="Country"
                    fullWidth
                    validate={(val: string) => (val ? null : 'Empty')}
                />
            </Grid>
        </Grid>
    )
})

export const AddressEntries = React.memo(function AddressEntries({
    disabled,
    input,
    push,
    prefix,
}: {
    disabled: boolean
    input: AddressEntryData[]
    push: (inp: AddressEntryData) => void
    prefix: string
}) {
    const lastEntry = input.length
        ? input[input.length - 1]
        : {
              start: 'invalid',
              stop: 'invalid',
              addressline: '',
          }
    React.useEffect(() => {
        if (!lastEntry.start || !lastEntry.stop || lastEntry.addressline) {
            return
        }
        push({
            start: '',
            stop: '',
            addressline: '',
            city: '',
            zipcode: '',
            country: '',
            primary: input.length ? false : true,
        })
    }, [lastEntry.start, lastEntry.stop])
    return (
        <>
            {input.map((val, index) => (
                <AddressEntry
                    prefix={prefix}
                    index={index}
                    disabled={disabled}
                    key={index}
                />
            ))}
        </>
    )
})

export default React.memo(function AddressBlock({
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
                    Addresses
                </span>
            </summary>
            <FieldArray name="addresses">
                {({ push, form, name }: FieldArrayRenderProps) => (
                    <AddressEntries
                        disabled={disabled}
                        push={push}
                        prefix={name}
                        input={form.values[name]}
                    />
                )}
            </FieldArray>
        </details>
    )
})
