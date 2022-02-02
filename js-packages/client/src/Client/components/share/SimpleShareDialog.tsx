import { DialogActions, DialogContent } from '@mui/material'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import * as React from 'react'

import * as Contexts from '../../contexts'

export default function SimpleShareDialog({ shareUrl }: { shareUrl?: string }) {
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
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setOpen(false)} color="secondary">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}
