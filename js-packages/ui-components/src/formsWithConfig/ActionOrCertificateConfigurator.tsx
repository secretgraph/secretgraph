import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import * as Constants from '@secretgraph/misc/constants'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    ActionInputEntry,
    CertificateInputEntry,
} from '@secretgraph/misc/utils/action'
import { FastField, useField, useFormikContext } from 'formik'
import * as React from 'react'

import FormikCheckboxWithLabel from '../formik/FormikCheckboxWithLabel'
import FormikDateTimePicker from '../formik/FormikDateTimePicker'
import FormikTextField from '../formik/FormikTextField'
import SimpleSelect from '../forms/SimpleSelect'
import TokenSelect from '../forms/TokenSelect'

const availableActions = [
    'auth',
    'view',
    'create',
    'inject',
    'manage',
    'push',
    'delete',
    'update',
    'storedUpdate',
]
const publicActions = availableActions.filter((val) => val != 'view')
const publicShareActions = availableActions.filter(
    (val) => val != 'view' && val != 'auth'
)
const shareActions = availableActions.filter((val) => val != 'auth')
const contentOnlyActions = new Set(['push'])
const clusterOnlyActions = new Set(['create', 'storedUpdate'])

function primeFields(values: any, path: string[], primetype: any): boolean {
    if (path.length == 0) {
        return false
    }
    let hasChanges: boolean = false
    if (values[path[0]] === undefined) {
        if (path.length == 1) {
            // deep clone
            values[path[0]] = JSON.parse(JSON.stringify(primetype))
        } else {
            values[path[0]] = {}
        }
        hasChanges = true
    }
    return primeFields(values[path[0]], path.slice(1), primetype) || hasChanges
}

type ActionConfiguratorProps = {
    value: ActionInputEntry
    path?: '' | `${string}.`
    disabled?: boolean
    tokens: string[]
    noToken?: boolean
    lockAction?: boolean
    handleNoteChange?: TextFieldProps['onChange']
    isContent: boolean
    hashAlgorithm: string
    mode?: 'public' | 'default' | 'share' | 'publicShare'
    validForOptions?: string[]
    config: Interfaces.ConfigInterface
}
type CertificateConfiguratorProps = {
    value: CertificateInputEntry
    disabled?: boolean
    path?: '' | `${string}.`
    handleNoteChange?: TextFieldProps['onChange']
}

export type ActionOrCertificateConfiguratorProps = Omit<
    ActionConfiguratorProps,
    'value'
> & { value: ActionInputEntry | CertificateInputEntry }

const ActionFields = React.memo(function ActionFields({
    path,
    disabled,
    isContent,
    extraPrimes,
}: {
    path: '' | `${string}.`
    isContent: boolean
    disabled?: boolean
    extraPrimes: { [key: string]: any }
}) {
    const { values, setValues } = useFormikContext<any>()
    const { value: action } = useField<any>(`${path}action`)[0]
    React.useEffect(() => {
        async function f() {
            const validFields =
                Constants.validFields[
                    `${action || extraPrimes[`${path}action`]}${
                        isContent ? 'Content' : 'Cluster'
                    }`
                ]

            if (!validFields) {
                console.error(
                    'Invalid: ',
                    `${action}${isContent ? 'Content' : 'Cluster'}`
                )
                return
            }
            const newValues: any = Object.assign({}, values)
            let hasChanges = false
            for (const [key, primetype] of Object.entries(validFields)) {
                if (
                    primeFields(
                        newValues,
                        `${path}${key}`.split('.'),
                        primetype
                    )
                ) {
                    hasChanges = true
                }
            }
            for (const [key, primetype] of Object.entries(extraPrimes)) {
                if (
                    primeFields(
                        newValues,
                        `${path}${key}`.split('.'),
                        primetype
                    )
                ) {
                    hasChanges = true
                }
            }
            if (hasChanges) {
                await setValues(newValues, false)
            }
        }
        f()
    }, [action])
    if (!action) {
        return null
    }
    switch (action) {
        case 'auth':
            return (
                <div>
                    <FastField
                        component={FormikTextField}
                        name={`${path}requester`}
                        disabled={disabled}
                        helperText="Requester"
                    />
                    <FastField
                        component={FormikTextField}
                        name={`${path}challenge`}
                        disabled={disabled}
                        helperText="challenge"
                    />
                </div>
            )
        case 'view':
            if (isContent) {
                return (
                    <div>
                        <FastField
                            component={FormikCheckboxWithLabel}
                            name={`${path}fetch`}
                            type="checkbox"
                            Label={{ label: 'Fetch' }}
                            disabled={disabled}
                        />
                        <FastField
                            component={FormikCheckboxWithLabel}
                            name={`${path}allowPeek`}
                            type="checkbox"
                            Label={{ label: 'Allow Peek' }}
                            disabled={disabled}
                        />
                    </div>
                )
            } else {
                return (
                    <div>
                        <FastField
                            component={SimpleSelect}
                            name={`${path}includeTags`}
                            disabled={disabled}
                            options={[]}
                            label="Include tags"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={SimpleSelect}
                            name={`${path}excludeTags`}
                            disabled={disabled}
                            options={[]}
                            label="Exclude tags"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={SimpleSelect}
                            name={`${path}includeTypes`}
                            disabled={disabled}
                            options={[]}
                            label="Include types"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={SimpleSelect}
                            name={`${path}excludeTypes`}
                            disabled={disabled}
                            options={[]}
                            label="Exclude types"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={SimpleSelect}
                            name={`${path}states`}
                            disabled={disabled}
                            options={[]}
                            label="Only states"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={FormikCheckboxWithLabel}
                            name={`${path}allowPeek`}
                            type="checkbox"
                            Label={{ label: 'Allow Peek' }}
                            disabled={disabled}
                        />
                    </div>
                )
            }
        case 'delete':
            if (isContent) {
                return <div></div>
            } else {
                return (
                    <Stack>
                        <FastField
                            component={SimpleSelect}
                            name={`${path}includeTags`}
                            disabled={disabled}
                            options={[]}
                            label="Include tags"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={SimpleSelect}
                            name={`${path}excludeTags`}
                            disabled={disabled}
                            options={[]}
                            label="Exclude tags"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={SimpleSelect}
                            name={`${path}includeTypes`}
                            disabled={disabled}
                            options={[]}
                            label="Include types"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={SimpleSelect}
                            name={`${path}excludeTypes`}
                            disabled={disabled}
                            options={[]}
                            label="Exclude types"
                            freeSolo
                            multiple
                        />
                        <FastField
                            component={SimpleSelect}
                            name={`${path}states`}
                            disabled={disabled}
                            options={[]}
                            label="Only states"
                            freeSolo
                            multiple
                        />
                    </Stack>
                )
            }
        case 'inject':
            return <></>
        case 'create':
        case 'update':
            return <></>
        case 'manage':
            return <></>
        case 'push':
            if (!isContent) {
                throw Error('Push only defined for contents')
            }
            return <></>
        default:
            return (
                <Typography color="error">
                    Unsupported Actiontype: {`${action}`}
                </Typography>
            )
    }
})

const SelectStartStop = React.memo(function SelectStartStop({
    disabled,
    path,
}: {
    disabled: boolean
    path: '' | `${string}.`
}) {
    const { value: minDateTime } = useField(`${path}start`)[0]
    const { value: maxDateTime } = useField(`${path}stop`)[0]
    return (
        <>
            <Grid container>
                <Grid xs={12} sm={6}>
                    <FastField
                        name={`${path}start`}
                        component={FormikDateTimePicker}
                        max={maxDateTime}
                        disabled={disabled}
                        label="Start"
                    />
                </Grid>
                <Grid xs={12} sm={6}>
                    <FastField
                        name={`${path}stop`}
                        component={FormikDateTimePicker}
                        min={minDateTime}
                        disabled={disabled}
                        label="Stop"
                    />
                </Grid>
            </Grid>
        </>
    )
})

const TokenAndValidForSelector = React.memo(function TokenAndValidForSelector({
    disabled,
    path,
    validForOptions,
    tokens,
    hashAlgorithm,
}: {
    disabled: boolean
    path: '' | `${string}.`
    validForOptions: string[]
    tokens?: string[]
    hashAlgorithm: string
}) {
    return (
        <Grid container spacing={1}>
            {tokens ? (
                <Grid xs={12} sm={6}>
                    <FastField
                        name={`${path}data`}
                        component={TokenSelect}
                        hashAlgorithm={hashAlgorithm}
                        updateHashField={`${path}newHash`}
                        fullWidth
                        freeSolo
                        tokens={tokens}
                        disabled={disabled}
                        label="Token"
                    />
                </Grid>
            ) : null}
            {validForOptions.length >= 1 ? (
                <Grid xs={12} sm={6}>
                    <FastField
                        name={`${path}validFor`}
                        component={SimpleSelect}
                        fullWidth
                        multiple
                        options={validForOptions}
                        disabled={disabled}
                        label="Valid for"
                    />
                </Grid>
            ) : null}
        </Grid>
    )
})

function ActionConfigurator({
    value,
    path = '',
    disabled,
    isContent,
    noToken,
    lockAction,
    tokens,
    hashAlgorithm,
    handleNoteChange,
    mode = 'default',
    validForOptions,
    config,
}: ActionConfiguratorProps) {
    disabled = !!(disabled || value?.readonly)

    const { value: note, onChange: onChangeNote } = useField(`${path}note`)[0]
    const { value: newHash } = useField(`${path}newHash`)[0]

    React.useLayoutEffect(() => {
        const curEntry = config.tokens[newHash]
        if (curEntry && curEntry.note && curEntry.note != note) {
            onChangeNote(curEntry.note)
        }
    }, [newHash])

    const validactions = React.useMemo(() => {
        const actions =
            mode == 'share'
                ? shareActions
                : mode == 'public'
                ? publicActions
                : mode == 'publicShare'
                ? publicShareActions
                : availableActions
        if (isContent) {
            return actions.filter((val) => !clusterOnlyActions.has(val))
        } else {
            return actions.filter((val) => !contentOnlyActions.has(val))
        }
    }, [isContent, mode])
    const locked = React.useMemo(() => {
        if (
            value?.delete ||
            value?.locked ||
            value?.value?.action == 'other'
        ) {
            return true
        }
        const v = value?.value?.action || 'view'
        return !validactions.some((val) => v == val)
    }, [validactions, value?.delete, value?.locked])

    return (
        <Stack direction="column" spacing={2}>
            {value.value?.action != 'other' ? (
                <>
                    <FastField
                        name={`${path}value.action`}
                        component={SimpleSelect}
                        options={validactions}
                        disabled={!!(disabled || locked || lockAction)}
                        label="Action"
                        fullWidth
                    />
                    {mode != 'share' && mode != 'publicShare' && (
                        <SelectStartStop
                            path={path}
                            disabled={disabled || locked}
                        />
                    )}
                </>
            ) : null}
            {(validForOptions && validForOptions.length >= 1) || !noToken ? (
                <TokenAndValidForSelector
                    tokens={noToken ? undefined : tokens}
                    validForOptions={validForOptions || []}
                    disabled={disabled || locked}
                    path={path}
                    hashAlgorithm={hashAlgorithm}
                />
            ) : null}
            {handleNoteChange ? (
                <TextField
                    onChange={handleNoteChange}
                    fullWidth
                    multiline
                    minRows={2}
                    label="Note"
                    value={note}
                />
            ) : note ? (
                <TextField
                    disabled
                    fullWidth
                    multiline
                    label="Note"
                    value={note}
                />
            ) : null}
            {!locked && (
                <Box sx={{ leftMargin: { s: 1, m: 2 } }}>
                    <ActionFields
                        path={`${path}value.`}
                        disabled={disabled || locked}
                        isContent={isContent}
                        extraPrimes={{
                            [`${path}value.action`]: value.value.action,
                            [`${path}validFor`]: value.validFor,
                        }}
                    />
                </Box>
            )}
        </Stack>
    )
}

function CertificateConfigurator({
    value,
    disabled,
    path = '',
    handleNoteChange,
}: CertificateConfiguratorProps) {
    disabled = !!(disabled || value?.readonly)
    const { value: note } = useField(`${path}note`)[0]

    return (
        <Box
            sx={{
                '& .MuiTextField-root': { m: 1 },
            }}
        >
            <div>
                <Typography variant="h4">Certificate:</Typography>
                <div style={{ wordBreak: 'break-all' }}>{value.data}</div>
            </div>
            {handleNoteChange ? (
                <div>
                    <TextField
                        onChange={handleNoteChange}
                        fullWidth
                        multiline
                        minRows={2}
                        label="Note"
                        value={note}
                    />
                </div>
            ) : note ? (
                <div>
                    <TextField
                        disabled
                        fullWidth
                        multiline
                        label="Note"
                        value={note}
                    />
                </div>
            ) : null}
        </Box>
    )
}

// maybe remove auth
// Configurator for actions and certificates
export default function ActionOrCertificateConfigurator({
    value,
    disabled,
    handleNoteChange,
    ...props
}: ActionOrCertificateConfiguratorProps) {
    if (value.type == 'action') {
        return (
            <ActionConfigurator
                value={value}
                disabled={disabled}
                handleNoteChange={handleNoteChange}
                {...props}
            />
        )
    } else {
        return (
            <CertificateConfigurator
                value={value}
                disabled={disabled}
                handleNoteChange={handleNoteChange}
            />
        )
    }
}
