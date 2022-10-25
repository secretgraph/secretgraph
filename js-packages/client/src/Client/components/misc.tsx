import {
    default as CircularProgress,
    CircularProgressProps,
} from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import * as React from 'react'

export const CenteredSpinner = React.forwardRef(
    (props: CircularProgressProps, ref) => {
        return (
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                }}
            >
                <CircularProgress ref={ref} {...props} />
            </div>
        )
    }
)

export class CapturingSuspense extends React.PureComponent<
    { noSuspense?: boolean; children: React.ReactNode },
    { error: null | any }
> {
    constructor(props: any) {
        super(props)
        this.state = { error: null }
    }
    render() {
        if (this.state.error) {
            return (
                <Typography color="error" gutterBottom>
                    {`${this.state.error}`}
                </Typography>
            )
        }
        if (this.props.noSuspense) {
            return this.props.children
        }
        return (
            <React.Suspense fallback={<CenteredSpinner />}>
                {this.props.children}
            </React.Suspense>
        )
    }
    componentDidCatch(error: any, info: any) {
        console.error(error, info)
    }
    static getDerivedStateFromError(error: any) {
        return { error: error }
    }
}
