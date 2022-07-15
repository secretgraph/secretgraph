import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import * as Interfaces from '@secretgraph/misc/interfaces'
import { loadConfig, loadConfigSync } from '@secretgraph/misc/utils/config'
import * as React from 'react'

import Definitions from './Definitions'
import { theme as themeDefinition } from './theme'

type Props = {
    defaultPath?: string
    homeUrl?: string
}

function Client(props: Props) {
    const [config, setConfig] = React.useState<Interfaces.ConfigInterface|null>(()=> loadConfigSync())
    const [loading, setLoading] = React.useState(()=>!config)
    React.useEffect(()=> {
        if(config){
            return
        }
        let active = true
        const query = new URLSearchParams(window.location.hash.substring(1))
        async function f(){
            const url = new URL(query.get("url") || props.defaultPath || "", window.location.href)
            query.delete("url")
            url.hash = query.toString()
            try {
                const conf = await loadConfig(url.href)
                if(conf && active){
                    setConfig(conf)
                }
            } finally {
                if(active){
                    setLoading(false)
                }
            }
        }
        // TODO: Login screen
        if(query.has("key") && (query.get("url") || props.defaultPath )){
            f()
        } else {
            setLoading(false)
        }
        return ()=> {
            active = false
        }
    }, [])
    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <ThemeProvider theme={themeDefinition}>
                <CssBaseline />
                {!loading && <Definitions {...props} config={config} />}
            </ThemeProvider>
        </LocalizationProvider>
    )
}

export default React.memo(Client)
