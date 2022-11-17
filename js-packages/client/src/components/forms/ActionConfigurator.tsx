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
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem, { ListItemProps } from '@mui/material/ListItem'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import ListItemText from '@mui/material/ListItemText'
import Portal from '@mui/material/Portal'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
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
]
const publicActions = availableActions.filter((val) => val != 'view')

const availableActionsSet = new Set(availableActions)

const ActionFields = React.memo(function ActionFields({
    action,
    path,
    disabled,
    isContent,
}: {
    action: string
    path: '' | `${string}.`
    isContent: boolean
    disabled?: boolean
}) {
    switch (action) {
        case 'view':
        case 'auth':
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
                    </div>
                )
            }
        case 'delete':
            if (isContent) {
                return (
                    <div>
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
                    </div>
                )
            }
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
    mode?: 'public' | 'auth' | 'default'
}

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
    const locked =
        value?.delete ||
        value?.locked ||
        !availableActionsSet.has(value?.value?.action || 'view')

    const { setValue: changeToken } = getFieldHelpers(`${path}data`)
    const { value: minDateTime } = useField(`${path}start`)[0]
    const { value: maxDateTime } = useField(`${path}stop`)[0]

    return (
        <Box
            sx={{
                '& .MuiTextField-root': { m: 1 },
            }}
        >
            {value.type == 'action' && value.value?.action != 'other' ? (
                <>
                    {mode != 'auth' ? (
                        <>
                            <div>
                                <Typography>
                                    For security reasons action options are not
                                    shown after creation. Use note field to
                                    document them
                                </Typography>
                                <FastField
                                    name={`${path}value.action`}
                                    component={SimpleSelect}
                                    options={
                                        mode == 'public'
                                            ? publicActions
                                            : availableActions
                                    }
                                    disabled={disabled || locked}
                                    label="Action"
                                    fullWidth
                                />
                            </div>
                            <Divider />
                        </>
                    ) : null}

                    <Grid container>
                        <Grid item xs={12} sm={6}>
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
                        <Grid item xs={12} sm={6}>
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
            {!locked && (
                <div>
                    <Grid container spacing={2}>
                        <ActionFields
                            action={value.value?.action}
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
