import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import * as Interfaces from '@secretgraph/misc/interfaces'
import * as React from 'react'

interface DecisionFrameProps {
    mainCtx: Interfaces.MainContextInterface
    updateMainCtx?: (
        updateOb: Partial<Interfaces.MainContextInterface>
    ) => void
    view: any
    edit: any
    create: any
}

export default class DecisionFrame extends React.Component<
    DecisionFrameProps,
    { error: null | any }
> {
    constructor(props: DecisionFrameProps) {
        super(props)
        this.state = { error: null }
    }
    retrieve_element() {
        let Elem
        if (this.props.mainCtx.action == 'view' && this.props.mainCtx.item) {
            Elem = this.props.view
        } else if (
            this.props.mainCtx.action == 'update' &&
            this.props.mainCtx.item
        ) {
            Elem = this.props.edit
        } else if (this.props.mainCtx.action == 'create') {
            Elem = this.props.create
        } else {
            return () => <></>
        }
        return Elem
    }
    render() {
        const recoverFn = this.props.updateMainCtx
        if (this.state.error) {
            return (
                <>
                    <Typography color="error" gutterBottom paragraph>
                        We detected an error
                    </Typography>
                    <Typography color="error">
                        {`${this.state.error}`}
                    </Typography>
                    {recoverFn ? (
                        <>
                            Do you want to try to recover by switching to
                            :custom and fix the errors?
                            <Button
                                onClick={() => recoverFn({ type: ':custom' })}
                            >
                                Switch to custom
                            </Button>
                        </>
                    ) : null}
                </>
            )
        }
        const Elem = this.retrieve_element()
        return (
            <React.Suspense fallback={<Skeleton variant="rectangular" />}>
                <Elem />
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
