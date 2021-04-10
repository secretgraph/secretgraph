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
import Collapse from '@material-ui/core/Collapse'
import Dialog, { DialogProps } from '@material-ui/core/Dialog'
import DialogTitle from '@material-ui/core/DialogTitle'
import Grid from '@material-ui/core/Grid'
import IconButton from '@material-ui/core/IconButton'
import LinearProgress from '@material-ui/core/LinearProgress'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import Typography from '@material-ui/core/Typography'
import AddIcon from '@material-ui/icons/Add'
import MoreVertIcon from '@material-ui/icons/MoreVert'
import {
    FastField,
    FieldArray,
    FieldArrayRenderProps,
    Form,
    Formik,
    FormikProps,
    useField,
    useFormikContext,
} from 'formik'
import { TextField as FormikTextField } from 'formik-material-ui'
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

const availableActionsSet = new Set(['manage', 'push', 'view', 'update'])

export const ActionEntry = React.memo(function TokenEntry({
    selected,
    setSelected,
    action,
    index,
}: {
    selected?: Set<string>
    setSelected?: (arg: Set<string>) => void
    action?: {
        token: string
        note: string
        newHash: string
        oldHash: null | string
        configActions: Set<string>
        newActions: Set<string>
    }
    index: number
}) {
    return (
        <ListItem>
            {action && selected && setSelected && (
                <ListItemIcon>
                    <Checkbox
                        edge="start"
                        checked={selected.has(action.newHash)}
                        tabIndex={-1}
                        disableRipple
                        onChange={(ev) => {
                            const tmpselected = new Set(selected)
                            if (ev.target.checked) {
                                tmpselected.add(action.newHash)
                            } else {
                                tmpselected.delete(action.newHash)
                            }
                            setSelected(tmpselected)
                        }}
                    />
                </ListItemIcon>
            )}
            <Grid container spacing={2}>
                {/** here comes the FieldArray fields */}
            </Grid>
        </ListItem>
    )
})

interface ActionsDialogProps
    extends FieldArrayRenderProps,
        Omit<DialogProps, 'children' | 'onClose'> {
    disabled?: boolean
    handleClose: () => void
    form: FormikProps<{
        actions: {
            keyHash: string | null
            start: Date | null
            stop: Date | null
            note: string
            value: any
            update?: undefined | boolean
            disabled: boolean
        }[]
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
    const { hashIdMapper } = React.useMemo(() => {
        return {
            hashIdMapper: Object.fromEntries(
                form.values.actions.map((val, id) => [val.keyHash, id])
            ),
            // TODO: actually sort
            // sortedList: actions.slice(),
        }
    }, [form.values.actions])

    return (
        <Dialog {...dialogProps} onClose={(ev) => handleClose()}>
            <DialogTitle>Access Control</DialogTitle>
            <DialogContent>
                <List>
                    <ActionEntry index={-1} />
                </List>
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={async (ev) => {
                        form.values.actions.forEach((val, index) => {
                            if (val.update !== undefined)
                                replace(index, {
                                    ...val,
                                    update: true,
                                })
                        })
                        form.setFieldTouched('actions', true)
                        form.setFieldValue('button', 'only_actions', false)
                        try {
                            await form.submitForm()
                        } finally {
                            handleClose()
                        }
                    }}
                    disabled={
                        disabled ||
                        form.values.actions.every((val) => !val.update)
                    }
                >
                    Update old tokens
                </Button>
                <Button
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
                    Save only Tokens
                </Button>
                <Button
                    disabled={disabled}
                    onClick={(ev) => {
                        form.setFieldValue(
                            'actions',
                            form.initialValues.actions
                        )
                        form.setFieldTouched('actions', false)
                    }}
                >
                    Reset
                </Button>
                <Button disabled={disabled} onClick={(ev) => handleClose()}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}
