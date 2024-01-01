import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import {
    loadConfigSync,
    saveConfig,
    updateConfigReducer,
} from '@secretgraph/misc/utils/config'
import { is_pwa } from '@secretgraph/misc/utils/misc'
import * as React from 'react'

import Definitions from './Definitions'
import { theme as themeDefinition } from './theme'

type Props = {
    defaultPath?: string
    homeUrl?: string
}

function Client(props: Props) {
    const [config, updateConfig] = React.useReducer(
        updateConfigReducer,
        null,
        () => {
            let [conf, needsUpdate] = loadConfigSync(
                is_pwa() ? window.localStorage : window.sessionStorage
            )
            /**if(res[1]){
                 *  trigger update

                }*/
            return conf
        }
    )
    React.useEffect(() => {
        if (!config) {
            return
        }
        saveConfig(
            config,
            is_pwa() ? window.localStorage : window.sessionStorage
        )
    }, [config])

    return (
        <ThemeProvider theme={themeDefinition}>
            <CssBaseline />
            <Definitions
                {...props}
                config={config}
                updateConfig={updateConfig}
            />
        </ThemeProvider>
    )
}

export default React.memo(Client)
