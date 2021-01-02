import * as React from 'react'

import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ListSubheader from '@material-ui/core/ListSubheader'
import { AuthInfoInterface } from '../../interfaces'

type SideBarItemsProps = {
    authinfo?: AuthInfoInterface
    header?: any
}

export default (appProps: SideBarItemsProps) => {
    const { header, authinfo } = appProps
    let _header = null
    if (header) {
        _header = <ListSubheader key="header">{header}</ListSubheader>
    }

    return (
        <List>
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
