import { Typography } from '@mui/material'
import FormControl from '@mui/material/FormControl'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { compareClientPw } from '@secretgraph/misc/utils/encryption'
import * as React from 'react'

import * as Contexts from '../contexts'
import { passwordLabel } from '../messages'

export default React.memo(function ConfigProtected({
    children,
    disarmed = false,
}: React.PropsWithChildren<{ disarmed?: boolean }>) {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [password, setPassword] = React.useState('')
    const [pwOk, setPwOk] = React.useState(false)
    const deferredPw = React.useDeferredValue(password)
    React.useEffect(() => {
        if (!config || disarmed) {
            return
        }
        let active = true
        const f = async () => {
            setPwOk(false)
            const _isPwOk = await compareClientPw(
                deferredPw,
                config.configSecurityQuestion[1]
            )
            if (active && _isPwOk) {
                setPwOk(true)
            }
            setPwOk(false)
        }
        f()
        return () => {
            active = false
        }
    }, [deferredPw, disarmed])
    if (disarmed) {
        return <>{children}</>
    }
    if (!pwOk) {
        return (
            <Stack spacing={1}>
                <Typography>{config.configSecurityQuestion[0]}</Typography>
                <FormControl>
                    <TextField
                        fullWidth={true}
                        value={password}
                        onChange={(ev) => setPassword(ev.target.value)}
                        variant="outlined"
                        label="Answer"
                        type="password"
                    />
                </FormControl>
            </Stack>
        )
    } else {
        return <>{children}</>
    }
})
