import { Theme } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import * as React from 'react'

import DecisionFrame from '../components/DecisionFrame'
import * as Contexts from '../contexts'
import { newClusterLabel } from '../messages'

type Props = {}

const EditConfig = ({ viewOnly }: { viewOnly?: boolean }) => {
    return <div />
}
const ViewConfig = (props: Props) => {
    const theme = useTheme()

    return <EditConfig viewOnly />
}

const CreateConfig = (props: Props) => {
    const theme = useTheme()

    return <div />
}

export default function ConfigComponent() {
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    return (
        <DecisionFrame
            mainCtx={mainCtx}
            updateMainCtx={updateMainCtx}
            create={CreateConfig}
            view={ViewConfig}
            edit={EditConfig}
        />
    )
}
