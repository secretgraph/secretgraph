import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import * as React from 'react'

import { drawerWidth } from '../../theme'

export type SidebarTreeItemLabelProps = {
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    title?: string
    marked?: boolean
    deleted?: boolean
    heading?: boolean
    children: React.ReactNode
}

export default React.memo(function SidebarTreeItemLabel({
    leftIcon,
    children,
    deleted,
    heading,
    marked,
    title,
    rightIcon,
}: SidebarTreeItemLabelProps) {
    let item = (
        <Box
            sx={{
                display: 'flex' as const,
                flexWrap: 'nowrap' as const,
                flexDirection: 'row' as const,
                maxWidth: `calc(${drawerWidth} - 20px)`,
                alignItems: 'center',
                fontSize: heading ? '1.5rem !important' : undefined,
                color: deleted ? 'red' : undefined,
                backgroundColor: marked ? 'gray' : undefined,
            }}
        >
            {leftIcon}
            <Box
                sx={{
                    marginLeft: leftIcon ? '4px' : undefined,
                    marginRight: rightIcon ? '4px' : undefined,
                    wordBreak: 'break-all' as const,
                    maxWidth: '200px',
                }}
            >
                {children}
            </Box>
            {rightIcon}
        </Box>
    )
    if (title) {
        return <Tooltip title={title}>{item}</Tooltip>
    }
    return item
})
