import Tooltip from '@mui/material/Tooltip'
import ListItemButton, {
    ListItemButtonProps,
} from '@mui/material/ListItemButton'
import ListItemText, { ListItemTextProps } from '@mui/material/ListItemText'
import ListItem, { ListItemProps } from '@mui/material/ListItem'

import * as React from 'react'

import { drawerWidth } from '../../theme'

export type SidebarItemLabelProps = {
    title?: string
    deleted?: boolean
    label: string
    leftOfLabel?: React.ReactNode
    rightOfLabel?: React.ReactNode
    listItemTextProps?: ListItemTextProps
    listItemProps?: ListItemProps
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
    listItemProps,
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
    } else if (listItemProps) {
        item = <ListItem {...listItemProps}>{item}</ListItem>
    }

    if (title) {
        item = <Tooltip title={title}>{item}</Tooltip>
    }
    return item
})
