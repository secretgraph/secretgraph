import { useLazyQuery } from '@apollo/client'
import GroupWorkIcon from '@mui/icons-material/GroupWork'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import DescriptionIcon from '@mui/icons-material/Description'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DraftsIcon from '@mui/icons-material/Drafts'
import ReplayIcon from '@mui/icons-material/Replay'
import MailIcon from '@mui/icons-material/Mail'
import MovieIcon from '@mui/icons-material/Movie'
import List, { ListProps } from '@mui/material/List'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import * as SetOps from '@secretgraph/misc/utils/set'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { b64tobuffer, utf8decoder } from '@secretgraph/misc/utils/encoding'
import * as React from 'react'
import IconButton from '@mui/material/IconButton'

import * as Contexts from '../../contexts'
import SideBarContents from './contents'
import SidebarItemLabel from './SidebarItemLabel'
import Checkbox from '@mui/material/Checkbox'
import { elements } from '../../editors'

export default React.memo(function ContentItem({
    node,
    authinfoContent,
}: {
    node: any
    authinfoContent?: Interfaces.AuthInfoInterface
}) {
    const { mainCtx, goToNode } = React.useContext(Contexts.Main)
    const { selected, setSelected, selectionMode } = React.useContext(
        Contexts.SidebarItemsSelected
    )
    let name = node.tags.find((flag: string) => flag.startsWith('name='))
    if (name) {
        // split works different in js, so match
        name = name.match(/=(.*)/)[1]
    }
    if (!name) {
        name = node.id
        if (name) {
            try {
                const rawTxt = utf8decoder.decode(b64tobuffer(name))
                let [_, tmp] = rawTxt.match(/:(.*)/) as string[]
                name = tmp
            } catch (exc) {
                name = `...${node.id.slice(-48)}`
            }
        }
    }
    let Icon
    switch (node.type) {
        case 'Message':
            Icon = MailIcon
            break
        case 'File':
            Icon = MovieIcon
            break
        default:
            Icon = DescriptionIcon
    }
    if (node.state == 'draft') {
        Icon = DraftsIcon
    }

    // TODO: check availability of extra content permissions. Merge authInfos
    // for now assume yes if manage type was not specified

    //console.debug('available actions', node.availableActions)
    const selectable =
        !authinfoContent ||
        !SetOps.hasIntersection(authinfoContent.types, ['delete', 'manage']) ||
        (
            node.availableActions as {
                type: string
            }[]
        ).some((val) => val.type == 'delete' || val.type == 'manage')
    return (
        <SidebarItemLabel
            key={node.id}
            deleted={node.deleted}
            leftOfLabel={<Icon />}
            listItemButtonProps={{
                dense: true,
                disableRipple: true,
                selected: mainCtx.item == node.id,
                onDoubleClick: (ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    goToNode({
                        ...node,
                        title: name,
                    })
                },
            }}
            primary={`${
                elements.get(node.type)
                    ? elements.get(node.type)?.label
                    : node.type
            }: ${name}`}
            rightOfLabel={
                <ListItemSecondaryAction>
                    <Checkbox
                        disabled={!selectable}
                        sx={{
                            display:
                                selectionMode == 'none' ? 'hidden' : undefined,
                        }}
                        onChange={(ev) => {
                            ev.preventDefault()
                            ev.stopPropagation()
                            const index = selected.indexOf(node.id)
                            let newSelected
                            if (index === -1) {
                                newSelected = [...selected, node.id]
                            } else {
                                newSelected = selected.toSpliced(index, 1)
                            }
                            setSelected(newSelected)
                        }}
                        checked={selected.indexOf(node.id) !== -1}
                    />
                </ListItemSecondaryAction>
            }
        />
    )
})
