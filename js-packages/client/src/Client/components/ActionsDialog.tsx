import {
    Checkbox,
    DialogActions,
    DialogContent,
    ListItemIcon,
    ListSubheader,
    Menu,
    MenuItem,
    Portal,
} from '@material-ui/core'
import { Divider } from '@material-ui/core'
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
import DeleteIcon from '@material-ui/icons/Delete'
import MoreVertIcon from '@material-ui/icons/MoreVert'
import {
    ActionInputEntry,
    CertificateInputEntry,
} from '@secretgraph/misc/utils/action'
import {
    serializeToBase64,
    unserializeToArrayBuffer,
} from '@secretgraph/misc/utils/encryption'
import { deepEqual } from '@secretgraph/misc/utils/misc'
import * as SetOps from '@secretgraph/misc/utils/set'
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
import { useAsync } from 'react-async'

import FormikCheckBox from './formik/FormikCheckbox'
import FormikTextField from './formik/FormikTextField'
import SimpleSelect from './forms/SimpleSelect'

const availableActionsSet = new Set([
    'manage',
    'push',
    'view',
    'delete',
    'update',
])

const ActionFields = React.memo(function ActionFields({
    action,
    index,
    disabled,
}: {
    action: string
    index: number | undefined
    disabled?: boolean
}) {
    switch (action) {
        case 'view':
        case 'delete':
            return (
                <>
                    <Grid item></Grid>
                </>
            )
        case 'update':
            return (
                <>
                    <Grid item></Grid>
                </>
            )
        case 'manage':
            return (
                <>
                    <Grid item></Grid>
                </>
            )
        case 'push':
            return (
                <>
                    <Grid item></Grid>
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

function ActionEntryIntern({
    action,
    index,
    disabled,
    deleteFn,
    submitFn,
    tokens,
}: {
    action?: ActionInputEntry | CertificateInputEntry
    index?: number
    disabled?: boolean
    deleteFn?: () => void
    submitFn?: () => void
    tokens: string[]
}) {
    const { values } = useFormikContext<any>()
    disabled = !!(disabled || action?.readonly)
    const locked =
        action?.delete ||
        action?.locked ||
        !availableActionsSet.has(action?.value?.action || 'view')

    return (
        <Grid container spacing={2} direction="column">
            <Grid item container wrap="nowrap" spacing={2}>
                <Grid item container spacing={2}>
                    {submitFn && (
                        <Grid item xs={12}>
                            <Typography variant="h4" align="center">
                                Add
                            </Typography>
                        </Grid>
                    )}
                    <Grid item xs={12}>
                        For security reasons action options are not shown after
                        creation. Use note field to document them
                    </Grid>
                    <Grid item xs={4}>
                        <FastField
                            name={
                                !submitFn
                                    ? `actions.${index}.value.action`
                                    : 'value.action'
                            }
                            component={SimpleSelect}
                            options={['view', 'update', 'manage']}
                            disabled={disabled || locked}
                            label="Action"
                        />
                    </Grid>
                    <Grid item xs={4}>
                        <FastField
                            name={
                                !submitFn ? `actions.${index}.start` : 'start'
                            }
                            component={FormikTextField}
                            fullWidth
                            type="datetime-local"
                            disabled={disabled || locked}
                            inputProps={{
                                pattern:
                                    '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}',
                            }}
                            label="Start"
                        />
                    </Grid>
                    <Grid item xs={4}>
                        <FastField
                            name={!submitFn ? `actions.${index}.stop` : 'stop'}
                            component={FormikTextField}
                            fullWidth
                            type="datetime-local"
                            inputProps={{
                                pattern:
                                    '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}',
                            }}
                            disabled={disabled || locked}
                            label="Stop"
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <FastField
                            name={!submitFn ? `actions.${index}.data` : 'data'}
                            component={SimpleSelect}
                            fullWidth
                            freeSolo
                            options={tokens}
                            renderOption={(val: string) => {
                                if (val == 'new') {
                                    return (
                                        <Typography style={{ color: 'green' }}>
                                            {val}
                                        </Typography>
                                    )
                                }
                                return val
                            }}
                            disabled={disabled || locked}
                            label="Token"
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <FastField
                            name={!submitFn ? `actions.${index}.note` : 'note'}
                            component={FormikTextField}
                            fullWidth
                            disabled={disabled || action?.delete}
                            label="Note"
                            multiline
                            variant="outlined"
                        />
                    </Grid>
                    {!locked && action?.type != 'certificate' && (
                        <Grid item xs={12}>
                            <Grid container spacing={2}>
                                <ActionFields
                                    action={
                                        !submitFn
                                            ? action?.value?.action
                                            : values?.value?.action
                                    }
                                    index={index}
                                    disabled={disabled || locked}
                                />
                            </Grid>
                        </Grid>
                    )}
                </Grid>
                {action && action.update !== undefined && !submitFn && (
                    <Grid item>
                        <Tooltip title="Update Action" arrow>
                            <span>
                                <FastField
                                    name={`actions.${index}.update`}
                                    disabled={
                                        disabled ||
                                        action?.delete ||
                                        action?.readonly
                                    }
                                    component={FormikCheckBox}
                                    type="checkbox"
                                />
                            </span>
                        </Tooltip>
                    </Grid>
                )}
                {action && !submitFn && deleteFn && (
                    <Grid item>
                        <Tooltip title="Delete" arrow>
                            <span>
                                {action?.oldHash ? (
                                    <Field
                                        name={`actions.${index}.delete`}
                                        disabled={disabled || action?.readonly}
                                        component={FormikCheckBox}
                                        type="checkbox"
                                    />
                                ) : (
                                    <IconButton
                                        onClick={deleteFn}
                                        disabled={disabled || action?.readonly}
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                )}
                            </span>
                        </Tooltip>
                    </Grid>
                )}
            </Grid>
            {submitFn && [
                <Grid key="0" item>
                    <Divider />
                </Grid>,
                <Grid key="1" item>
                    <Tooltip title="Add Action" arrow>
                        <span>
                            <Button
                                variant="outlined"
                                color="primary"
                                disabled={
                                    disabled ||
                                    action?.delete ||
                                    action?.readonly
                                }
                                onClick={submitFn}
                            >
                                Add
                            </Button>
                        </span>
                    </Tooltip>
                </Grid>,
            ]}
        </Grid>
    )
}

export function ActionEntry({
    action,
    index,
    disabled,
    addFn,
    deleteFn,
    tokens,
    ...props
}: Omit<ListItemProps, 'children' | 'button'> & {
    action?: ActionInputEntry | CertificateInputEntry
    index?: number
    disabled?: boolean
    addFn?: (arg: ActionInputEntry) => void | Promise<void>
    deleteFn?: () => void
    tokens: string[]
}) {
    const ref = React.useRef<any>()
    const newTokens = React.useMemo(() => tokens.concat('new'), [tokens])
    if (addFn) {
        return (
            <ListItem {...props}>
                <div ref={ref} />
                <Portal container={ref.current}>
                    <Formik
                        initialValues={{
                            type: 'action',
                            data: 'new',
                            start: '',
                            stop: '',
                            note: '',
                            delete: false,
                            update: undefined,
                            value: {
                                action: 'view',
                            } as any,
                        }}
                        onSubmit={async (
                            { data, ...values },
                            { resetForm }
                        ) => {
                            if (data == 'new') {
                                data = Buffer.from(
                                    crypto.getRandomValues(new Uint8Array(32))
                                ).toString('base64')
                            }
                            await addFn({ data, ...values })
                            resetForm()
                        }}
                    >
                        {(formikProps: FormikProps<any>) => (
                            <ActionEntryIntern
                                disabled={disabled}
                                tokens={newTokens}
                                submitFn={formikProps.submitForm}
                            />
                        )}
                    </Formik>
                </Portal>
            </ListItem>
        )
    } else {
        return (
            <ListItem {...props}>
                <ActionEntryIntern
                    action={action}
                    index={index}
                    disabled={disabled}
                    tokens={tokens}
                    deleteFn={deleteFn}
                />
            </ListItem>
        )
    }
}

interface ActionsDialogProps
    extends Pick<FieldArrayRenderProps, 'remove' | 'replace'>,
        Omit<DialogProps, 'children' | 'onClose'> {
    disabled?: boolean
    handleClose: () => void
    form: FormikProps<{
        actions: ActionInputEntry[]
    }>
}
// specify in hierachy for setting formik fields
export default function ActionsDialog({
    disabled,
    handleClose,
    form,
    remove,
    replace,
    ...dialogProps
}: ActionsDialogProps) {
    const tokens = React.useMemo(() => {
        const tokens: string[] = []
        for (const action of form.values.actions) {
            if (action.type == 'action') {
                tokens.push(action.value.data)
            }
        }
        return tokens
    }, [form.values.actions])
    return (
        <Dialog {...dialogProps} onClose={(ev) => handleClose()}>
            <DialogTitle>Access Control</DialogTitle>
            <DialogContent>
                <List>
                    {form.values.actions.map((val, index) => {
                        return (
                            <ActionEntry
                                index={index}
                                key={index}
                                disabled={disabled}
                                action={val}
                                tokens={tokens}
                                deleteFn={
                                    val.oldHash
                                        ? undefined
                                        : () => remove(index)
                                }
                            />
                        )
                    })}
                    <ActionEntry tokens={tokens} />
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
                        form.setStatus({
                            ...form.status,
                            button: 'only_actions',
                        })
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
