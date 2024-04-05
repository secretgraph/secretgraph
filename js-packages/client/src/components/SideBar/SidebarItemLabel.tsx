import Tooltip from '@mui/material/Tooltip'
import ListItemButton, {
    ListItemButtonProps,
} from '@mui/material/ListItemButton'
import ListItemText, { ListItemTextProps } from '@mui/material/ListItemText'

import * as React from 'react'

import { drawerWidth } from '../../theme'

export type SidebarItemLabelProps = {
    title?: string
    deleted?: boolean
    label: string
    leftOfLabel?: React.ReactNode
    rightOfLabel?: React.ReactNode
    listItemTextProps?: ListItemTextProps
    listItemButtonProps?: ListItemButtonProps
}

export default React.memo(function SidebarItemLabel({
    leftOfLabel,
    rightOfLabel,
    deleted,
    title,
    label,
    listItemButtonProps,
    listItemTextProps,
}: SidebarItemLabelProps) {
    let item = (
        <>
            {leftOfLabel}
            <ListItemText {...listItemTextProps}>
                <span
                    style={{
                        wordBreak: 'break-all' as const,
                        maxWidth: '200px',
                        color: deleted ? 'red' : undefined,
                    }}
                >
                    {label}
                </span>
            </ListItemText>
            {rightOfLabel}
        </>
    )

    if (listItemButtonProps) {
        item = <ListItemButton {...listItemButtonProps}>{item}</ListItemButton>
    }

    if (title) {
        item = <Tooltip title={title}>{item}</Tooltip>
    }
    return item
})
