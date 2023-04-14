import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Box from '@mui/system/Box'
import { compareClientPw } from '@secretgraph/misc/utils/encryption'
import * as React from 'react'

import * as Contexts from '../contexts'
import { passwordLabel } from '../messages'

export default function ConfigProtected({
    children,
    disarmed = false,
    wrapper: Wrapper = undefined,
}: React.PropsWithChildren<{
    disarmed?: boolean
    wrapper?: any
}>) {
    const { config } = React.useContext(Contexts.InitializedConfig)
    const [password, setPassword] = React.useState('')
    const [pwOk, setPwOk] = React.useState(false)
    const [loading, setLoading] = React.useState(true)
    const deferredPw = React.useDeferredValue(password)
    React.useEffect(() => {
        if (!config || disarmed) {
            return
        }
        let active = true
        const f = async () => {
            setPwOk(false)
            setLoading(true)
            const _isPwOk = await compareClientPw(
                deferredPw,
                config.configSecurityQuestion[1]
            )
            if (active) {
                if (_isPwOk) {
                    setPwOk(true)
                }
                setLoading(false)
            }
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
        const inner = (
            <form>
                <Stack spacing={4}>
                    <Typography variant="h4">
                        Proceed by answering the security question
                    </Typography>
                    <Typography>{config.configSecurityQuestion[0]}</Typography>
                    <FormControl>
                        <TextField
                            fullWidth={true}
                            value={password}
                            onChange={(ev) => setPassword(ev.target.value)}
                            variant="outlined"
                            label="Answer"
                            type="password"
                            autoComplete="on"
                        />
                    </FormControl>
                    <Box
                        sx={{
                            paddingLeft: {
                                sm: 2,
                                md: 4,
                                lg: 8,
                            },
                        }}
                    >
                        {loading ? (
                            <CircularProgress />
                        ) : (
                            <Typography variant="h4" color="error">
                                Password incorrect
                            </Typography>
                        )}
                    </Box>
                </Stack>
            </form>
        )
        if (!Wrapper) {
            return inner
        }
        return <Wrapper>{inner}</Wrapper>
    } else {
        return <>{children}</>
    }
}
