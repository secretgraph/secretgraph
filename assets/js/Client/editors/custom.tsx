import { Theme } from '@material-ui/core/styles'
import * as React from 'react'

import * as Contexts from '../contexts'
import { newClusterLabel } from '../messages'
import { useStylesAndTheme } from '../theme'

type Props = {}
const ViewCustom = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()
    // list all tags
    // view content if possible
    // elsewise just download

    return <div />
}

const AddCustom = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <div />
}

const EditCustom = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <div />
}

export default function CustomComponent(props: Props) {
    const { mainCtx } = React.useContext(Contexts.Main)
    if (mainCtx.action == 'view' && mainCtx.item) {
        return <ViewCustom />
    } else if (mainCtx.action == 'edit' && mainCtx.item) {
        return <EditCustom />
    } else if (mainCtx.action == 'add') {
        return <AddCustom />
    }
    return null
}
