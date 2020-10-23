

import * as React from "react";
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import CircularProgress from '@material-ui/core/CircularProgress';
import Typography from '@material-ui/core/Typography';


import { MainContextInterface } from "../interfaces"
import { useStylesAndTheme } from "../theme";


type ViewProps = {
  shareurl: string,
  // special attribute
  children: any
};

export const ViewFrame = (props: ViewProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { children, shareurl} = props;

  return (
    <React.Fragment>
      <Card>
        <CardContent>
          {children || null}
        </CardContent>
      </Card>

    </React.Fragment>
  );
}


type EditProps = {
  shareurl?: string,
  // special attribute
  children: any
};

export const EditFrame = (props: EditProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { children } = props;

  return (
    <React.Fragment>
      <Card>
        <CardContent>
          {children}
        </CardContent>
      </Card>

    </React.Fragment>
  );
}


interface DecisionFrameProps {
  mainCtx: MainContextInterface
  view: any
  edit: any
  add: any
}

export class DecisionFrame extends React.Component<DecisionFrameProps, {error: null | any}> {
  constructor(props: DecisionFrameProps) {
    super(props);
    this.state = { error: null };
  }
  render_element(){
    let Elem;
    if (this.props.mainCtx.action == "view" && this.props.mainCtx.item) {
      Elem = this.props.view
    } else if (this.props.mainCtx.action == "edit" && this.props.mainCtx.item) {
      Elem = this.props.edit
    } else if (this.props.mainCtx.action == "add") {
      Elem = this.props.add
    } else {
      return null;
    }
    return (<Elem/>)
  }
  render(){
    if (this.state.error) {
      return (
        <Typography color="textPrimary" gutterBottom paragraph>
          {`${this.state.error}`}
        </Typography>
      );
    }
    return (
      <React.Suspense fallback={<CircularProgress />}>
        {this.render_element()}
      </React.Suspense>
    );
  }
  componentDidCatch(error: any, info: any) {
    console.error(error, info);
  }
  static getDerivedStateFromError(error: any) {
    return { error: error };
  }

};
