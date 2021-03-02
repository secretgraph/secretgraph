import {
    default as CircularProgress,
    CircularProgressProps,
} from '@material-ui/core/CircularProgress'
import Typography from '@material-ui/core/Typography'
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
    { noSuspense?: boolean },
    { error: null | any }
> {
    constructor(props: any) {
        super(props)
        this.state = { error: null }
    }
    render() {
        if (this.state.error) {
            return (
                <Typography color="textPrimary" gutterBottom paragraph>
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
