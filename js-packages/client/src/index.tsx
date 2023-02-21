import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import * as Interfaces from '@secretgraph/misc/interfaces'
import {
    loadConfig,
    loadConfigSync,
    saveConfig,
    updateConfigReducer,
} from '@secretgraph/misc/utils/config'
import { createClient } from '@secretgraph/misc/utils/graphql'
import { is_pwa } from '@secretgraph/misc/utils/misc'
import { updateConfigRemoteReducer } from '@secretgraph/misc/utils/operations'
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

    const [loading, setLoading] = React.useState(() => !config)
    React.useEffect(() => {
        if (config) {
            return
        }
        let active = true
        const query = new URLSearchParams(window.location.hash.substring(1))
        async function f() {
            const url = new URL(
                query.get('url') || props.defaultPath || '',
                window.location.href
            )
            query.delete('url')
            url.hash = query.toString()
            try {
                let [conf, needsUpdate] = await loadConfig(url.href)
                if (!conf) {
                    return
                }
                if (active && needsUpdate) {
                    conf = await updateConfigRemoteReducer(conf, {
                        update: {},
                        client: createClient(conf.baseUrl),
                    })
                }
                if (active) {
                    updateConfig({ update: conf, replace: true })
                }
            } finally {
                if (active) {
                    setLoading(false)
                }
            }
        }
        if (query.has('key') && (query.get('url') || props.defaultPath)) {
            f()
        } else {
            setLoading(false)
        }
        return () => {
            active = false
        }
    }, [])
    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <ThemeProvider theme={themeDefinition}>
                <CssBaseline />
                {!loading && (
                    <Definitions
                        {...props}
                        config={config}
                        updateConfig={updateConfig}
                    />
                )}
            </ThemeProvider>
        </LocalizationProvider>
    )
}

export default React.memo(Client)
