import Tooltip from '@mui/material/Tooltip'
import ListItem from '@mui/material/ListItem'

import * as React from 'react'

import { drawerWidth } from '../../theme'

export type SidebarItemLabelProps = {
    leftIcon?: React.ReactNode
    rightIcon?: React.ReactNode
    title?: string
    marked?: boolean
    deleted?: boolean
    heading?: boolean
    children: React.ReactNode
}

export default React.memo(function SidebarItemLabel({
    leftIcon,
    children,
    deleted,
    heading,
    marked,
    title,
    rightIcon,
}: SidebarItemLabelProps) {
    let item = (
        <ListItem>
            <div
                style={{
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
                <div
                    style={{
                        marginLeft: leftIcon ? '4px' : undefined,
                        marginRight: rightIcon ? '4px' : undefined,
                        wordBreak: 'break-all' as const,
                        maxWidth: '200px',
                    }}
                >
                    {children}
                </div>
                {rightIcon}
            </div>
        </ListItem>
    )
    if (title) {
        return <Tooltip title={title}>{item}</Tooltip>
    }
    return item
})
