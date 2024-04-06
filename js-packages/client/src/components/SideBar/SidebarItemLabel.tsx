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
    primary: string
    deleted?: boolean
    leftOfLabel?: React.ReactNode
    rightOfLabel?: React.ReactNode
    listItemTextProps?: Exclude<
        ListItemTextProps,
        'primary' | 'disableTypography' | 'children'
    >
    listItemButtonProps?: ListItemButtonProps
    listItemProps?: ListItemProps
}

export default React.memo(function SidebarItemLabel({
    leftOfLabel,
    rightOfLabel,
    title,
    primary,
    listItemButtonProps,
    listItemTextProps,
    listItemProps,
    deleted,
}: SidebarItemLabelProps) {
    listItemTextProps = {
        ...(listItemTextProps || {}),
        primaryTypographyProps: {
            ...(listItemTextProps?.primaryTypographyProps || {}),
            sx: {
                wordBreak: 'break-all' as const,
                maxWidth: '200px',
                color: deleted ? 'red' : undefined,
                ...(listItemTextProps?.primaryTypographyProps?.sx || {}),
            },
        },
    }

    let item = (
        <>
            {leftOfLabel}
            <ListItemText {...listItemTextProps}>{primary}</ListItemText>
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
