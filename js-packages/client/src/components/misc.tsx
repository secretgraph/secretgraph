import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import {
    default as CircularProgress,
    CircularProgressProps,
} from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import TableCell from '@mui/material/TableCell'
import TableRow, { TableRowProps } from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import {
    ActionInputEntry,
    CertificateInputEntry,
} from '@secretgraph/misc/utils/action'
import { FastField } from 'formik'
import * as React from 'react'

import FormikCheckBox from './formik/FormikCheckbox'

export const CenteredSpinner = React.forwardRef(
    (props: CircularProgressProps, ref) => {
        return (
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                }}
            >
                <CircularProgress ref={ref} {...props} />
            </div>
        )
    }
)

export class CapturingSuspense extends React.PureComponent<
    { noSuspense?: boolean; children: React.ReactNode; skeleton?: boolean },
    { error: null | any }
> {
    constructor(props: any) {
        super(props)
        this.state = { error: null }
    }
    render() {
        if (this.state.error) {
            return (
                <Typography color="error" gutterBottom>
                    {`${this.state.error}`}
                </Typography>
            )
        }
        if (this.props.noSuspense) {
            return this.props.children
        }

        return (
            <React.Suspense
                fallback={
                    this.props.skeleton ? (
                        <Skeleton variant="rectangular" />
                    ) : (
                        <CenteredSpinner />
                    )
                }
            >
                {this.props.children}
            </React.Suspense>
        )
    }
    componentDidCatch(error: any, info: any) {
        console.error(error, info)
    }
    static getDerivedStateFromError(error: any) {
        return { error: error }
    }
}

export const HashEntry = React.memo(function HashEntry({
    item,
    lastItem,
    disabled,
    selectItem,
    deleteItem,
    noUpgrade,
    ...props
}: Omit<TableRowProps, 'children'> & {
    item: {
        value: ActionInputEntry | CertificateInputEntry
        index: number
    }
    lastItem?: {
        value: ActionInputEntry | CertificateInputEntry
        index: number
    }
    disabled?: boolean
    noUpgrade?: boolean
    selectItem: (arg: {
        value: ActionInputEntry | CertificateInputEntry
        index: number
    }) => void | Promise<void>
    deleteItem?: (arg: {
        value: ActionInputEntry
        index: number
    }) => void | Promise<void>
}) {
    if (item.value.type == 'action') {
        return item.value.oldHash == lastItem?.value?.oldHash ? (
            <TableRow {...props}>
                <TableCell
                    size="small"
                    onClick={() => selectItem(item)}
                    style={{ wordBreak: 'break-all' }}
                >
                    <div>{item.value.value.action}</div>
                </TableCell>
                <TableCell size="small" padding="checkbox"></TableCell>
                <TableCell size="small"></TableCell>
            </TableRow>
        ) : (
            <TableRow {...props}>
                <TableCell
                    size="small"
                    onClick={() => selectItem(item)}
                    style={{ wordBreak: 'break-all' }}
                >
                    <div>{item.value.newHash}</div>
                    <div>{item.value.value.action}</div>
                </TableCell>
                {noUpgrade ? null : (
                    <TableCell size="small" padding="checkbox">
                        <FastField
                            name={`actions.${item.index}.update`}
                            disabled={
                                disabled ||
                                item.value.delete ||
                                item.value.readonly
                            }
                            component={FormikCheckBox}
                            style={{
                                display:
                                    item.value.update !== undefined
                                        ? undefined
                                        : 'none',
                            }}
                            size="small"
                            type="checkbox"
                        />
                    </TableCell>
                )}
                <TableCell size="small">
                    {deleteItem ? (
                        <IconButton
                            size="small"
                            edge="end"
                            aria-label="trash"
                            disabled={item.value.readonly || disabled}
                            onClick={() =>
                                deleteItem(
                                    item as {
                                        value: ActionInputEntry
                                        index: number
                                    }
                                )
                            }
                        >
                            <DeleteIcon />
                        </IconButton>
                    ) : null}
                </TableCell>
            </TableRow>
        )
    } else {
        return (
            <TableRow {...props}>
                <TableCell
                    size="small"
                    onClick={() => selectItem(item)}
                    style={{ wordBreak: 'break-all' }}
                >
                    <div>{item.value.newHash}</div>
                    <div>{item.value.newHash}</div>
                </TableCell>
                <TableCell size="small" padding="checkbox">
                    <FastField
                        name={`actions.${item.index}.update`}
                        disabled={
                            disabled ||
                            item.value.delete ||
                            item.value.readonly
                        }
                        component={FormikCheckBox}
                        style={{
                            display:
                                item.value.update !== undefined
                                    ? undefined
                                    : 'none',
                        }}
                        size="small"
                        type="checkbox"
                    />
                </TableCell>
                <TableCell size="small">
                    {deleteItem ? (
                        <IconButton
                            size="small"
                            edge="end"
                            aria-label="trash"
                            disabled={item.value.readonly || disabled}
                            onClick={() =>
                                deleteItem(
                                    item as {
                                        value: ActionInputEntry
                                        index: number
                                    }
                                )
                            }
                        >
                            <DeleteIcon />
                        </IconButton>
                    ) : null}
                </TableCell>
            </TableRow>
        )
    }
})
