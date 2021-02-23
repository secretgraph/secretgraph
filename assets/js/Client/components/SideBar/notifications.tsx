import List, { ListProps } from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ListSubheader from '@material-ui/core/ListSubheader'
import * as React from 'react'

import { AuthInfoInterface } from '../../interfaces'

type SideBarItemsProps = {
    authinfo?: AuthInfoInterface
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
