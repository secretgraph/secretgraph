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
import { FastField, Field, Form, Formik, useFormikContext } from 'formik'
import { TextField as FormikTextField } from 'formik-material-ui'
import * as React from 'react'
import { useAsync } from 'react-async'

import * as Constants from '../constants'
import * as Contexts from '../contexts'
import { getActionsQuery } from '../queries/node'
import { calculateTokenMapper } from '../utils/config'
import {
    serializeToBase64,
    unserializeToArrayBuffer,
} from '../utils/encryption'
import * as SetOps from '../utils/set'

const availableActionsSet = new Set(['manage', 'push', 'view', 'update'])

export const TokenEntry = React.memo(function TokenEntry({
    selected,
    setSelected,
    action,
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
            <Grid container spacing={1}>
                {/** here comes the FieldArray fields */}
            </Grid>
        </ListItem>
    )
})

interface TokenDialogProps extends Omit<DialogProps, 'children' | 'onClose'> {
    disabled?: boolean
    handleClose: () => void
    hashMapper: {
        [keyHash: string]: {
            token: string
            note: string
            newHash: string
            oldHash: null | string
            configActions: Set<string>
            newActions: Set<string>
        }
    }
}
// specify in hierachy for setting formik fields
export default function TokenDialog({
    disabled,
    hashMapper,
    handleClose,
    ...props
}: TokenDialogProps) {
    const [selected, setSelected] = React.useState(new Set<string>())
    const {
        values: { tokens },
        submitForm,
    } = useFormikContext<{
        tokens: {
            idOrHash: string
            start: Date
            stop: Date | null
            note: string
            value: any
        }[]
    }>()
    const finishedList = React.useMemo(() => {
        const finishedList = []
        for (const action of Object.values(hashMapper)) {
            finishedList.push(
                <TokenEntry
                    selected={selected}
                    setSelected={setSelected}
                    action={action}
                />
            )
        }
        return finishedList
    }, [hashMapper])

    return (
        <Dialog {...props} onClose={(ev) => handleClose()}>
            <DialogTitle>Tokens</DialogTitle>
            <DialogContent>
                <List>
                    <ListSubheader>
                        <ListItemIcon>
                            <Checkbox
                                edge="start"
                                checked={selected.size == finishedList.length}
                                tabIndex={-1}
                                disableRipple
                            />
                        </ListItemIcon>
                    </ListSubheader>
                    <TokenEntry />
                </List>
            </DialogContent>
            <DialogActions>
                <Button disabled={disabled} onClick={(ev) => handleClose()}>
                    Close
                </Button>
                <Button
                    disabled={
                        disabled ||
                        Object.values(hashMapper).every((val) => val.oldHash)
                    }
                >
                    Persist Tokens
                </Button>
                <Button
                    disabled={
                        disabled ||
                        Object.values(hashMapper).every(
                            (val) =>
                                !val.oldHash ||
                                (val.oldHash == val.newHash &&
                                    SetOps.isNotEq(
                                        SetOps.intersection(
                                            availableActionsSet,
                                            val.configActions
                                        ),
                                        val.newActions
                                    ))
                        )
                    }
                >
                    Update Tokens
                </Button>
                <Button>Close</Button>
            </DialogActions>
        </Dialog>
    )
}
