import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import {
    Checkbox,
    DialogActions,
    DialogContent,
    ListItemIcon,
    ListSubheader,
    Menu,
    MenuItem,
    Portal,
} from '@mui/material'
import { Divider } from '@mui/material'
import Button from '@mui/material/Button'
import Dialog, { DialogProps } from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem, { ListItemProps } from '@mui/material/ListItem'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import ListItemText from '@mui/material/ListItemText'
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

import FormikCheckBox from './formik/FormikCheckbox'
import FormikDateTimePicker from './formik/FormikDateTimePicker'
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
        case 'auth':
            return (
                <>
                    <Grid item></Grid>
                </>
            )
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
                        Unsupported Actiontype: {`${action}`}
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
                    <Grid item xs={12} md={4}>
                        {action?.type == 'certificate' ||
                        action?.value?.action == 'other' ? null : (
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
                        )}
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <FastField
                            name={
                                !submitFn ? `actions.${index}.start` : 'start'
                            }
                            component={FormikDateTimePicker}
                            fullWidth
                            maxDateTime={
                                values[
                                    !submitFn ? `actions.${index}.stop` : 'stop'
                                ]
                            }
                            disabled={disabled || locked}
                            clearable
                            showTodayButton
                            label="Start"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <FastField
                            name={!submitFn ? `actions.${index}.stop` : 'stop'}
                            component={FormikDateTimePicker}
                            fullWidth
                            minDateTime={
                                values[
                                    !submitFn
                                        ? `actions.${index}.start`
                                        : 'start'
                                ]
                            }
                            clearable
                            showTodayButton
                            disabled={disabled || locked}
                            label="Stop"
                        />
                    </Grid>
                    <Grid item xs={12}>
                        {action?.type == 'certificate' ? (
                            <>
                                <Typography variant="h4">
                                    Certificate:
                                </Typography>
                                <div style={{ wordBreak: 'break-all' }}>
                                    {action.data}
                                </div>
                            </>
                        ) : (
                            <FastField
                                name={
                                    !submitFn ? `actions.${index}.data` : 'data'
                                }
                                component={SimpleSelect}
                                fullWidth
                                freeSolo
                                options={tokens}
                                renderOption={(
                                    props: React.HTMLAttributes<HTMLLIElement>,
                                    val: string
                                ) => {
                                    if (val == 'new') {
                                        return (
                                            <li {...props}>
                                                <Typography
                                                    style={{ color: 'green' }}
                                                >
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
                    {!locked && (
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
                        <Tooltip title="Update" arrow>
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
                                    <FastField
                                        name={`actions.${index}.delete`}
                                        disabled={disabled || action?.readonly}
                                        component={FormikCheckBox}
                                        type="checkbox"
                                    />
                                ) : (
                                    <IconButton
                                        onClick={deleteFn}
                                        disabled={disabled || action?.readonly}
                                        size="large"
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
                    deleteFn={
                        action?.type != 'certificate' ? deleteFn : undefined
                    }
                />
            </ListItem>
        )
    }
}

interface ActionsDialogProps
    extends Pick<FieldArrayRenderProps, 'remove' | 'replace' | 'push'>,
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
    push,
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
                    <ActionEntry
                        disabled={disabled}
                        tokens={tokens}
                        addFn={push}
                    />
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
                {/**<Button
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
                    Save (only Actions)
                </Button>**/}
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
                    Back
                </Button>
            </DialogActions>
        </Dialog>
    )
}
