import { ApolloClient, useApolloClient, useQuery } from '@apollo/client'
import {
    Checkbox,
    DialogActions,
    DialogContent,
    ListItemIcon,
    ListSubheader,
    Menu,
    MenuItem,
} from '@material-ui/core'
import Button from '@material-ui/core/Button'
import Dialog, { DialogProps } from '@material-ui/core/Dialog'
import DialogTitle from '@material-ui/core/DialogTitle'
import Grid from '@material-ui/core/Grid'
import IconButton from '@material-ui/core/IconButton'
import LinearProgress from '@material-ui/core/LinearProgress'
import List from '@material-ui/core/List'
import ListItem, { ListItemProps } from '@material-ui/core/ListItem'
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction'
import ListItemText from '@material-ui/core/ListItemText'
import Tooltip from '@material-ui/core/Tooltip'
import Typography from '@material-ui/core/Typography'
import AddIcon from '@material-ui/icons/Add'
import MoreVertIcon from '@material-ui/icons/MoreVert'
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
import {
    Checkbox as FormikCheckBox,
    CheckboxWithLabel as FormikCheckboxWithLabel,
    TextField as FormikTextField,
} from 'formik-material-ui'
import * as React from 'react'
import { useAsync } from 'react-async'

import * as Constants from '../constants'
import * as Contexts from '../contexts'
import * as Interfaces from '../interfaces'
import { getActionsQuery } from '../queries/node'
import {
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../utils/encryption'
import { deepEqual } from '../utils/misc'
import * as SetOps from '../utils/set'
import SimpleSelect from './forms/SimpleSelect'

interface ActionProps {
    keyHash: string | null
    start: Date | null
    stop: Date | null
    note: string
    value: { [key: string]: any } & { action: string }
    update?: undefined | boolean
    delete: boolean
    readonly: boolean
}

const availableActionsSet = new Set(['manage', 'push', 'view', 'update'])

const ActionFields = React.memo(function ActionFields({
    action,
    index,
}: {
    action: string
    index: number | undefined
}) {
    switch (action) {
        case 'view':
            return (
                <>
                    <Grid item>
                        <Typography color="error">
                            Unsupported Actiontype
                        </Typography>
                    </Grid>
                </>
            )
        default:
            return (
                <Grid item xs={12}>
                    <Typography color="error">
                        Unsupported Actiontype
                    </Typography>
                </Grid>
            )
    }
})

export const ActionEntry = React.memo(function ActionEntry({
    action,
    index,
    disabled,
    ...props
}: Omit<ListItemProps, 'children' | 'button'> & {
    action?: ActionProps
    index?: number
    disabled?: boolean
}) {
    /**
    const {
        values: { actions },
    } = useFormikContext()
    */

    return (
        <ListItem {...props}>
            <Grid container spacing={2}>
                <Grid item>
                    <FastField
                        name={`actions.${index}.action`}
                        component={SimpleSelect}
                        options={[]}
                        disabled={disabled || action?.readonly}
                    />
                </Grid>
                <Grid item>
                    <FastField
                        name={`actions.${index}.start`}
                        component={FormikTextField}
                        type="datetime-local"
                        disabled={disabled || action?.readonly}
                        inputProps={{
                            pattern:
                                '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}',
                        }}
                    />
                </Grid>
                <Grid item>
                    <FastField
                        name={`actions.${index}.stop`}
                        component={FormikTextField}
                        type="datetime-local"
                        inputProps={{
                            pattern:
                                '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}',
                        }}
                        disabled={disabled || action?.readonly}
                    />
                </Grid>
                <Grid item container spacing={2}>
                    <ActionFields
                        action={action?.value?.action || ''}
                        index={index}
                    />
                </Grid>
            </Grid>
            <ListItemSecondaryAction>
                {action && action.update !== undefined && (
                    <Tooltip title="Update Action" arrow>
                        <span>
                            <Field
                                name={`actions.${index}.update`}
                                disabled={disabled || action?.readonly}
                                component={FormikCheckBox}
                                type="checkbox"
                            />
                        </span>
                    </Tooltip>
                )}
                {action && (
                    <Tooltip title="Delete" arrow>
                        <span>
                            <Field
                                name={`actions.${index}.delete`}
                                disabled={disabled || action?.readonly}
                                component={FormikCheckBox}
                                type="checkbox"
                            />
                        </span>
                    </Tooltip>
                )}
            </ListItemSecondaryAction>
        </ListItem>
    )
})

interface ActionsDialogProps
    extends FieldArrayRenderProps,
        Omit<DialogProps, 'children' | 'onClose'> {
    disabled?: boolean
    handleClose: () => void
    form: FormikProps<{
        actions: ActionProps[]
        button: string
    }>
}
// specify in hierachy for setting formik fields
export default function ActionsDialog({
    disabled,
    handleClose,
    form,
    move,
    swap,
    push,
    insert,
    unshift,
    pop,
    replace,
    ...dialogProps
}: ActionsDialogProps) {
    return (
        <Dialog {...dialogProps} onClose={(ev) => handleClose()}>
            <DialogTitle>Access Control</DialogTitle>
            <DialogContent>
                <List>
                    {form.values.actions.map((val) => {
                        return ActionEntry
                    })}
                    <ActionEntry />
                </List>
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    onClick={async (ev) => {
                        form.values.actions.forEach((val, index) => {
                            if (val.update !== undefined)
                                replace(index, {
                                    ...val,
                                    update: true,
                                })
                        })
                        form.setFieldTouched('actions', true)
                    }}
                    disabled={
                        disabled ||
                        form.values.actions.every((val) => !val.update)
                    }
                >
                    Accept all updates of actions
                </Button>
                <Button
                    variant="contained"
                    disabled={
                        disabled ||
                        deepEqual(
                            form.values['actions'],
                            form.initialValues['actions']
                        )
                    }
                    onClick={async (ev) => {
                        form.setFieldValue('button', 'only_actions', false)
                        try {
                            await form.submitForm()
                        } finally {
                            handleClose()
                        }
                    }}
                >
                    Save (only Tokens)
                </Button>
                <Button
                    variant="contained"
                    disabled={disabled}
                    onClick={(ev) => {
                        form.setFieldValue(
                            'actions',
                            form.initialValues.actions
                        )
                        form.setFieldTouched('actions', false)
                    }}
                >
                    Reset Tokens
                </Button>
                <Button disabled={disabled} onClick={(ev) => handleClose()}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}
