import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Dialog, { DialogProps } from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem, { ListItemProps } from '@mui/material/ListItem'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import ListItemText from '@mui/material/ListItemText'
import Portal from '@mui/material/Portal'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Unstable_Grid2'
import {
    ActionInputEntry,
    CertificateInputEntry,
} from '@secretgraph/misc/utils/action'
import { deepEqual } from '@secretgraph/misc/utils/misc'
import {
    FastField,
    Field,
    FieldArray,
    FieldArrayRenderProps,
    Form,
    Formik,
    FormikProps,
    useField,
    useFormikContext,
} from 'formik'
import * as React from 'react'

import FormikCheckbox from '../formik/FormikCheckbox'
import FormikCheckboxWithLabel from '../formik/FormikCheckboxWithLabel'
import FormikDateTimePicker from '../formik/FormikDateTimePicker'
import FormikTextField from '../formik/FormikTextField'
import SimpleSelect from './SimpleSelect'

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

export type ActionConfiguratorProps = {
    value: ActionInputEntry | CertificateInputEntry
    path?: '' | `${string}.`
    disabled?: boolean
    tokens: string[]
    isContent: boolean
    mode?: 'public' | 'default' | 'share' | 'publicShare'
}

// maybe remove auth
// Configurator for actions and certificates
export default function ActionConfigurator({
    value,
    path = '',
    disabled,
    tokens,
    isContent,
    mode = 'default',
}: ActionConfiguratorProps) {
    const tokensFinished = React.useMemo(() => {
        return [...tokens, 'new']
    }, [tokens])
    const { getFieldHelpers } = useFormikContext<any>()
    disabled = !!(disabled || value?.readonly)

    const { setValue: changeToken } = getFieldHelpers(`${path}data`)
    const { value: minDateTime } = useField(`${path}start`)[0]
    const { value: maxDateTime } = useField(`${path}stop`)[0]
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
            {value.type == 'action' && value.value?.action != 'other' ? (
                <>
                    <div>
                        <Typography>
                            For security reasons action options are not shown
                            after creation. Use note field to document them
                        </Typography>
                        <FastField
                            name={`${path}value.action`}
                            component={SimpleSelect}
                            options={validactions}
                            disabled={disabled || locked}
                            label="Action"
                            fullWidth
                        />
                    </div>
                    <Divider />
                    {mode != 'share' && mode != 'publicShare' && (
                        <>
                            <Grid container>
                                <Grid xs={12} sm={6}>
                                    <FastField
                                        name={`${path}start`}
                                        component={FormikDateTimePicker}
                                        maxDateTime={maxDateTime}
                                        disabled={disabled || locked}
                                        clearable
                                        showTodayButton
                                        label="Start"
                                    />
                                </Grid>
                                <Grid xs={12} sm={6}>
                                    <FastField
                                        name={`${path}stop`}
                                        component={FormikDateTimePicker}
                                        minDateTime={minDateTime}
                                        clearable
                                        showTodayButton
                                        disabled={disabled || locked}
                                        label="Stop"
                                    />
                                </Grid>
                            </Grid>
                            <Divider />
                        </>
                    )}
                </>
            ) : null}
            <div>
                {value.type == 'certificate' ? (
                    <>
                        <Typography variant="h4">Certificate:</Typography>
                        <div style={{ wordBreak: 'break-all' }}>
                            {value.data}
                        </div>
                    </>
                ) : (
                    <FastField
                        name={`${path}data`}
                        component={SimpleSelect}
                        fullWidth
                        freeSolo
                        options={tokensFinished}
                        onChange={(ev: any, val: string) => {
                            if (val == 'new') {
                                val = Buffer.from(
                                    crypto.getRandomValues(new Uint8Array(32))
                                ).toString('base64')
                            }
                            changeToken(val)
                        }}
                        renderOption={(
                            props: React.HTMLAttributes<HTMLLIElement>,
                            val: string
                        ) => {
                            if (val == 'new') {
                                return (
                                    <li {...props}>
                                        <Typography style={{ color: 'green' }}>
                                            {val}
                                        </Typography>
                                    </li>
                                )
                            }
                            return <li {...props}>{val}</li>
                        }}
                        disabled={disabled || locked}
                        label="Token"
                    />
                )}
            </div>

            <div>
                <FastField
                    name={`${path}note`}
                    component={FormikTextField}
                    fullWidth
                    disabled={disabled || value?.delete}
                    label="Note"
                    multiline
                    variant="outlined"
                />
            </div>
            {value.type == 'action' && !locked && (
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
