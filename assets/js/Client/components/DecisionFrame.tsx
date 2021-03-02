import Typography from '@material-ui/core/Typography'
import Skeleton from '@material-ui/lab/Skeleton'
import * as React from 'react'

import * as Interfaces from '../interfaces'

interface DecisionFrameProps {
    mainCtx: Interfaces.MainContextInterface
    view: any
    edit: any
    add: any
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
            this.props.mainCtx.action == 'edit' &&
            this.props.mainCtx.item
        ) {
            Elem = this.props.edit
        } else if (this.props.mainCtx.action == 'add') {
            Elem = this.props.add
        } else {
            return () => <></>
        }
        return Elem
    }
    render() {
        if (this.state.error) {
            return (
                <Typography color="textPrimary" gutterBottom paragraph>
                    {`${this.state.error}`}
                </Typography>
            )
        }
        const Elem = this.retrieve_element()
        return (
            <React.Suspense fallback={<Skeleton variant="rect" />}>
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
