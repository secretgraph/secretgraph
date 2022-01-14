import Box from '@mui/material/Box'
import * as React from 'react'

import { drawerWidth } from '../../theme'

export type SidebarTreeItemLabelProps = {
    icon?: React.ReactNode
    title?: string
    marked?: boolean
    deleted?: boolean
    heading?: boolean
    children: React.ReactNode
}

export default React.memo(function SidebarTreeItemLabel({
    icon,
    children,
    deleted,
    heading,
    marked,
    title,
}: SidebarTreeItemLabelProps) {
    return (
        <Box
            title={title}
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
            {icon}
            <Box
                sx={{
                    marginLeft: icon ? '4px' : undefined,
                    wordBreak: 'break-all' as const,
                    maxWidth: '200px',
                    flexGrow: 1,
                }}
            >
                {children}
            </Box>
        </Box>
    )
})
