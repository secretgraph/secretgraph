
import CircularProgress from '@material-ui/core/CircularProgress';
import Typography from '@material-ui/core/Typography';
import * as React from "react";


export class CapturingSuspense extends React.Component<{}, {error: null | any}> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
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
        {this.props.children}
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
