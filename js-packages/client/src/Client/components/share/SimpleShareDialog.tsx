import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel from '@mui/lab/TabPanel'
import { DialogActions, DialogContent } from '@mui/material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import Tab from '@mui/material/Tab'
import * as React from 'react'

import * as Contexts from '../../contexts'

export default function SimpleShareDialog({ shareUrl }: { shareUrl?: string }) {
    const [tab, setTab] = React.useState('1')
    const { mainCtx, updateMainCtx } = React.useContext(Contexts.Main)
    const [open, setOpen] = React.useState(false)

    React.useLayoutEffect(() => {
        if (shareUrl) {
            updateMainCtx({ shareFn: () => setOpen(true) })
        }
        return () => {
            updateMainCtx({ shareFn: null })
        }
    }, [shareUrl])
    return (
        <Dialog
            open={open}
            onClose={() => setOpen(false)}
            aria-labelledby="share-dialog-title"
        >
            <DialogTitle id="share-dialog-title">Share</DialogTitle>
            <DialogContent>
                <Link
                    href={'' + shareUrl}
                    onClick={(event: any) => {
                        if (navigator.clipboard) {
                            navigator.clipboard.writeText('' + shareUrl)
                            event.preventDefault()
                            console.log('url copied')
                            return false
                        } else {
                            console.log('clipboard not supported')
                        }
                    }}
                >
                    {shareUrl}
                </Link>
                <TabContext value={tab}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <TabList
                            onChange={(ev, val) => setTab(val)}
                            aria-label="share object"
                            variant="fullWidth"
                            textColor="primary"
                        >
                            <Tab label="One-Time Share" value="auth" />
                            <Tab label="Permanent Access" value="2" />
                            <Tab label="Overview" value="3" />
                        </TabList>
                    </Box>
                    <TabPanel value="1">Item One</TabPanel>
                    <TabPanel value="2">Item Two</TabPanel>
                    <TabPanel value="3">Item Three</TabPanel>
                </TabContext>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setOpen(false)} color="secondary">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}
