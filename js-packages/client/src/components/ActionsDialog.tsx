import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Dialog, { DialogProps } from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow, { TableRowProps } from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
    ActionInputEntry,
    CertificateInputEntry,
} from '@secretgraph/misc/utils/action'
import { FastField, FieldArrayRenderProps, FormikProps } from 'formik'
import * as React from 'react'

import FormikCheckBox from './formik/FormikCheckbox'
import ActionConfigurator from './formsWithContext/ActionOrCertificateConfigurator'
import { HashEntry } from './misc'

interface ActionsDialogProps
    extends Pick<FieldArrayRenderProps, 'remove' | 'replace' | 'push'>,
        Omit<DialogProps, 'children' | 'onClose'> {
    disabled?: boolean
    title?: string
    isContent: boolean
    isPublic: boolean
    fieldname?: string
    hashAlgorithm: string
    handleClose: () => void
    form: FormikProps<{
        [p: string]: (ActionInputEntry | CertificateInputEntry)[]
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
    isContent,
    isPublic,
    hashAlgorithm,
    maxWidth = 'xl',
    fullWidth = true,
    fieldname = 'actions',
    title = 'Access Control',
    ...dialogProps
}: ActionsDialogProps) {
    const tokens = React.useMemo(() => {
        const tokens: string[] = []
        for (const action of form.values[fieldname]) {
            if (action.type == 'action') {
                tokens.push(action.value.data)
            }
        }
        return tokens
    }, [form.values[fieldname]])
    const [selectedItem, setSelectedItem] = React.useState<
        | { value: ActionInputEntry | CertificateInputEntry; index: number }
        | undefined
    >(undefined)
    const deleteItem = React.useCallback(
        ({ value, index }: { value: ActionInputEntry; index: number }) => {
            if (value.delete) {
                return
            }
            replace(index, { ...value, delete: true })
        },
        [form.values[fieldname]]
    )
    const { filteredActions, filteredCertificates } = React.useMemo(() => {
        const ret: {
            filteredActions: {
                value: ActionInputEntry
                index: number
            }[]
            filteredCertificates: {
                value: CertificateInputEntry
                index: number
            }[]
        } = {
            filteredActions: [],
            filteredCertificates: [],
        }
        form.values[fieldname].forEach((value, index) => {
            if (value.delete) {
                return
            }
            if (value.type == 'action') {
                ret.filteredActions.push({ value, index })
            } else if (value.type == 'certificate') {
                ret.filteredCertificates.push({ value, index })
            } else {
                console.warn('invalid type: ', { value, index })
            }
        })
        ret.filteredActions.sort((a, b) =>
            a.value.newHash!.localeCompare(b.value.newHash as string)
        )
        ret.filteredCertificates.sort((a, b) =>
            a.value.newHash!.localeCompare(b.value.newHash as string)
        )
        return ret
    }, [form.values[fieldname]])
    const handleNoteChange = React.useCallback(
        (e: React.ChangeEvent) => {
            if (!selectedItem || selectedItem.value.type == 'action') {
                if (selectedItem) {
                    form.setFieldValue(
                        `${fieldname}.${selectedItem.index}.note`,
                        e
                    )
                    if (selectedItem.value.data) {
                        for (const item of filteredActions) {
                            if (
                                (selectedItem.index != item.index &&
                                    selectedItem.value.data) == item.value.data
                            ) {
                                form.setFieldValue(
                                    `${fieldname}.${item.index}.note`,
                                    e,
                                    false
                                )
                            }
                        }
                    }
                } else {
                    form.setFieldValue(
                        `${fieldname}.${form.values[fieldname].length}.note`,
                        e
                    )
                }
            } else {
                form.setFieldValue(
                    `${fieldname}.${selectedItem.index}.note`,
                    e
                )
            }
        },
        [selectedItem, filteredActions]
    )
    return (
        <Dialog
            fullWidth={fullWidth}
            maxWidth={maxWidth}
            onClose={(ev) => handleClose()}
            {...dialogProps}
        >
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <div>
                    <TextField label="Search" type="search" />
                </div>
                <Divider style={{ marginBottom: '5px', marginTop: '5px' }} />
                <Stack
                    direction="row"
                    divider={<Divider orientation="vertical" flexItem />}
                    spacing={2}
                >
                    <div style={{ flex: 1 }}>
                        <details open>
                            <summary>
                                <Typography component="span">
                                    Actions
                                </Typography>
                                <Divider />
                            </summary>

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Hash</TableCell>
                                            <TableCell padding="checkbox">
                                                Update
                                            </TableCell>
                                            <TableCell padding="none"></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredActions.map(
                                            (item, filteredIndex) => {
                                                return (
                                                    <HashEntry
                                                        hover
                                                        lastItem={
                                                            filteredIndex > 0
                                                                ? filteredActions[
                                                                      filteredIndex -
                                                                          1
                                                                  ]
                                                                : undefined
                                                        }
                                                        selected={
                                                            selectedItem?.index ==
                                                            item.index
                                                        }
                                                        key={item.index}
                                                        disabled={disabled}
                                                        item={item}
                                                        selectItem={
                                                            setSelectedItem
                                                        }
                                                        deleteItem={deleteItem}
                                                    />
                                                )
                                            }
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </details>
                        <details>
                            <summary>
                                <Typography component="span">
                                    Certificates
                                </Typography>
                                <Divider />
                            </summary>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Hash</TableCell>
                                            <TableCell padding="checkbox">
                                                Update
                                            </TableCell>
                                            <TableCell padding="none"></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredCertificates.map((item) => {
                                            return (
                                                <HashEntry
                                                    hover
                                                    selected={
                                                        selectedItem?.index ==
                                                        item.index
                                                    }
                                                    key={item.value.newHash}
                                                    disabled={disabled}
                                                    item={item}
                                                    selectItem={
                                                        setSelectedItem
                                                    }
                                                    deleteItem={deleteItem}
                                                />
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </details>
                    </div>
                    <div
                        style={{ flex: 1 }}
                        key={`isSelected${!!selectedItem}`}
                    >
                        <ActionConfigurator
                            path={
                                selectedItem
                                    ? `${fieldname}.${selectedItem.index}.`
                                    : `${fieldname}.${form.values[fieldname].length}.`
                            }
                            hashAlgorithm={hashAlgorithm}
                            isContent={isContent}
                            mode={isPublic ? 'public' : 'default'}
                            value={
                                selectedItem
                                    ? selectedItem.value
                                    : {
                                          type: 'action',
                                          start: '',
                                          stop: '',
                                          value: {
                                              action: isPublic
                                                  ? 'update'
                                                  : 'view',
                                          },
                                          data: '',
                                          note: '',
                                          newHash: '',
                                      }
                            }
                            handleNoteChange={handleNoteChange}
                            disabled={disabled}
                            tokens={tokens}
                        />
                    </div>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    onClick={async (ev) => {
                        form.values[fieldname].forEach((val, index) => {
                            if (val.update !== undefined)
                                replace(index, {
                                    ...val,
                                    update: true,
                                })
                        })
                        form.setFieldTouched(fieldname, true)
                    }}
                    disabled={
                        disabled ||
                        form.values[fieldname].every((val) => !val.update)
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
                            fieldname,
                            form.initialValues.actions
                        )
                        form.setFieldTouched(fieldname, false)
                    }}
                >
                    Reset Tokens
                </Button>
                <Button onClick={(ev) => handleClose()}>Back</Button>
            </DialogActions>
        </Dialog>
    )
}
