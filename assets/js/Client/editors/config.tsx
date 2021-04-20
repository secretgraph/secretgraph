import { Theme } from '@material-ui/core/styles'
import * as React from 'react'

import * as Contexts from '../contexts'
import { newClusterLabel } from '../messages'
import { useStylesAndTheme } from '../theme'

type Props = {}

const ViewCluster = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <div />
}

const AddCluster = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <div />
}

const EditCluster = (props: Props) => {
    const { classes, theme } = useStylesAndTheme()

    return <div />
}

export default function ConfigComponent(props: Props) {
    const { mainCtx } = React.useContext(Contexts.Main)
    if (mainCtx.action == 'view' && mainCtx.item) {
        return <ViewCluster />
    } else if (mainCtx.action == 'update' && mainCtx.item) {
        return <EditCluster />
    } else if (mainCtx.action == 'add') {
        return <AddCluster />
    }
    return null
}
