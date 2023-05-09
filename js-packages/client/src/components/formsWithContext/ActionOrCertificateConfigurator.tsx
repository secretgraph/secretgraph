import Box from '@mui/material/Box'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import {
    ActionInputEntry,
    CertificateInputEntry,
} from '@secretgraph/misc/utils/action'
import { parseISO } from 'date-fns'
import { FastField, useField } from 'formik'
import * as React from 'react'

import * as Contexts from '../../contexts'
import FormikCheckboxWithLabel from '../formik/FormikCheckboxWithLabel'
import FormikDateTimePicker from '../formik/FormikDateTimePicker'
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
}: {
    path: '' | `${string}.`
    isContent: boolean
    disabled?: boolean
}) {
    const { value: action } = useField(`${path}action`)[0]
    switch (action) {
        case 'auth':
            return <div></div>
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
                    </div>
                )
            }
        case 'inject':
            return (
                <>
                    <div></div>
                </>
            )
        case 'create':
        case 'update':
            return (
                <>
                    <div></div>
                </>
            )
        case 'manage':
            return (
                <>
                    <div></div>
                </>
            )
        case 'push':
            if (!isContent) {
                throw Error('Push only defined for contents')
            }
            return (
                <>
                    <div></div>
                </>
            )
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
                        maxDateTime={
                            maxDateTime ? parseISO(maxDateTime) : undefined
                        }
                        disabled={disabled}
                        clearable
                        showTodayButton
                        label="Start"
                    />
                </Grid>
                <Grid xs={12} sm={6}>
                    <FastField
                        name={`${path}stop`}
                        component={FormikDateTimePicker}
                        minDateTime={
                            minDateTime ? parseISO(minDateTime) : undefined
                        }
                        clearable
                        showTodayButton
                        disabled={disabled}
                        label="Stop"
                    />
                </Grid>
            </Grid>
        </>
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
}: ActionConfiguratorProps) {
    disabled = !!(disabled || value?.readonly)
    const { config } = React.useContext(Contexts.InitializedConfig)

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
        <Box
            sx={{
                '& .MuiTextField-root': { m: 1 },
            }}
        >
            {value.value?.action != 'other' ? (
                <>
                    <div>
                        <FastField
                            name={`${path}value.action`}
                            component={SimpleSelect}
                            options={validactions}
                            disabled={!!(disabled || locked || lockAction)}
                            label="Action"
                            fullWidth
                        />
                    </div>
                    <div>
                        {mode != 'share' && mode != 'publicShare' && (
                            <SelectStartStop
                                path={path}
                                disabled={disabled || locked}
                            />
                        )}
                    </div>
                </>
            ) : null}
            {!noToken ? (
                <div>
                    <FastField
                        name={`${path}data`}
                        component={TokenSelect}
                        hashAlgorithm={hashAlgorithm}
                        updateHashField={`${path}newHash`}
                        fullWidth
                        freeSolo
                        tokens={tokens}
                        disabled={disabled || locked}
                        label="Token"
                    />
                </div>
            ) : null}
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
            {!locked && (
                <div>
                    <Grid spacing={2} container>
                        <ActionFields
                            path={`${path}value.`}
                            disabled={disabled || locked}
                            isContent={isContent}
                        />
                    </Grid>
                </div>
            )}
        </Box>
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
