import List, { ListProps } from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

type SideBarItemsProps = {
    authinfo?: Interfaces.AuthInfoInterface
    header?: any
}

export default ({
    header,
    authinfo,
    ...props
}: SideBarItemsProps & ListProps) => {
    let _header = null
    if (header) {
        _header = <ListSubheader key="header">{header}</ListSubheader>
    }

    return (
        <List {...props}>
            {_header}
            <ListItem key="examplenotification">
                <ListItemText
                    key="examplenotification.text"
                    primary="TODO..."
                />
            </ListItem>
        </List>
    )
}
