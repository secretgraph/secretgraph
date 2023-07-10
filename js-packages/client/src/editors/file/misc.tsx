import CloudDownloadIcon from '@mui/icons-material/CloudDownload'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField, { TextFieldProps } from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Box from '@mui/system/Box'
import * as DOMPurify from 'dompurify'
import * as React from 'react'

import SunEditor from '../../components/SunEditor'

// hack for Suneditor
export const htmlIsEmpty = (value?: string): boolean => {
    return !value || value == '<p><br></p>' || value == '<p></p>'
}

export const ViewWidget = ({
    arrayBuffer,
    mime: mimeNew,
    name,
}: {
    arrayBuffer: Promise<ArrayBuffer>
    mime: string
    name: string
}) => {
    const [blobUrlOrText, setBlobUrlOrText] = React.useState<
        string | undefined
    >(undefined)
    const [mime, setMime] = React.useState<string>(mimeNew)
    React.useEffect(() => {
        let active = true
        const f = async () => {
            const _arrBuff = await arrayBuffer
            if (!_arrBuff || !active) {
                return
            }
            const oldBlobUrl = mime.startsWith('text/')
                ? undefined
                : blobUrlOrText
            if (mimeNew.startsWith('text/')) {
                try {
                    setMime(mimeNew)
                    setBlobUrlOrText(new TextDecoder().decode(_arrBuff))
                    // sanitize and render
                } catch (exc) {
                    console.error('Could not parse', exc)
                    setBlobUrlOrText(`${_arrBuff}`)
                    setMime(mimeNew)
                }
            } else {
                setBlobUrlOrText(
                    URL.createObjectURL(new Blob([_arrBuff], { type: mime }))
                )
                setMime(mimeNew)
            }
            if (oldBlobUrl) {
                URL.revokeObjectURL(oldBlobUrl)
            }
        }
        f()
        return () => {
            active = false
        }
    }, [arrayBuffer])
    if (blobUrlOrText === undefined) {
        return null
    }
    let inner: null | JSX.Element = null
    switch (mime.split('/', 1)[0]) {
        case 'text':
            if (mime == 'text/html') {
                const sanitized = DOMPurify.sanitize(blobUrlOrText)
                inner = <div dangerouslySetInnerHTML={{ __html: sanitized }} />
            } else {
                inner = <pre>{blobUrlOrText}</pre>
            }
            break
        case 'audio':
        case 'video':
            inner = (
                <video controls>
                    <source src={blobUrlOrText} style={{ width: '100%' }} />
                </video>
            )
            break
        case 'image':
            inner = (
                <a href={blobUrlOrText} rel="noopener noreferrer">
                    <img
                        src={blobUrlOrText}
                        alt={name}
                        style={{ width: '100%' }}
                    />
                </a>
            )
            break
    }
    return (
        <>
            <Box sx={{ marginBottom: (theme) => theme.spacing(2) }}>
                <Typography variant="h5">Content</Typography>
                {inner}
            </Box>
            {mime.startsWith('text/') ? null : (
                <Box sx={{ marginBottom: (theme) => theme.spacing(2) }}>
                    <a
                        href={blobUrlOrText}
                        type={mime}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <CloudDownloadIcon />
                    </a>
                </Box>
            )}
        </>
    )
}

export const Recorder = function Recorder() {
    const [useAudio, setUseAudio] = React.useState(true)
    const [useVideo, setUseVideo] = React.useState(true)
    const [recording, setRecording] = React.useState(false)

    return (
        <>
            <Box />
            <Stack direction="row">
                <FormControlLabel
                    control={<Checkbox disabled={recording} />}
                    onChange={(ev, checked) => setUseAudio(checked)}
                    label="audio"
                />
                <FormControlLabel
                    control={<Checkbox disabled={recording} />}
                    onChange={(ev, checked) => setUseVideo(checked)}
                    label="video"
                />
            </Stack>

            <Stack direction="row">
                <Button disabled={recording}>Start Recording</Button>
                <Button disabled={!recording}>Pause Recording</Button>
                <Button disabled={!recording}>Stop Recording</Button>
            </Stack>
        </>
    )
}

export const TextFileAdapter = ({
    mime,
    onChange,
    onBlur,
    value,
    ...props
}: {
    mime: string
    onChange: (newText: Blob) => void
    onBlur?: any
    value: Blob
} & Pick<TextFieldProps, 'disabled' | 'error' | 'helperText'>) => {
    if (!mime.startsWith('text/')) {
        return null
    }
    const [text, setText] = React.useState<string | undefined>(undefined)
    React.useLayoutEffect(() => {
        value.text().then((val) => setText(val))
    }, [value])
    if (text === undefined) {
        return null
    }
    if (mime === 'text/html') {
        return (
            <SunEditor
                label="Html Text"
                fullWidth
                variant="outlined"
                multiline
                value={text}
                onChange={(ev) => {
                    onChange(
                        new Blob([ev.currentTarget.value], { type: mime })
                    )
                }}
                onBlur={onBlur}
                InputProps={{
                    inputProps: {
                        width: '100%',
                        setOptions: {
                            minHeight: '500px',
                        },
                    },
                }}
                {...props}
            />
        )
    }
    return (
        <TextField
            {...props}
            fullWidth
            multiline
            variant="outlined"
            label={'Plaintext input'}
            onBlur={onBlur}
            defaultValue={text}
            onChange={(ev) => {
                onChange(new Blob([ev.currentTarget.value], { type: mime }))
            }}
        />
    )
}
