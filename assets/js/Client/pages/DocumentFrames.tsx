
import * as React from "react";
import { Theme } from "@material-ui/core/styles";
import { useQuery } from '@apollo/client';

import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import CircularProgress from '@material-ui/core/CircularProgress';

import { contentQuery } from "../queries/content"

type Props = {
  classes: any,
  theme: Theme,
  config: any,
  setConfig: any,
  mainContext: any,
  setMainContext: any
};


const renderQueryWrapper = (props:any) => {
  if (props.error) {
    return (<div>{props.error.message}</div>);
  } else if (props.props) {
    return null;
  }
  return (<CircularProgress />);
}


export const DocumentViewer = themeComponent((appProps: Props) => {
  const { classes, theme, config, setConfig, mainContext, setMainContext } = appProps;
  const {data, error} = useQuery(
    contentQuery,
    {
      variables: {
        id: mainContext.item
      }
    }
  );
  if (error) {
    return (<div>{error.message}</div>);
  } else if (data) {
    return null;
  }
  return (<CircularProgress />);
});

export const DocumentForm = themeComponent((appProps: Props) => {
  const { classes, theme, mainContext, setMainContext } = appProps;
  const {data, error} = useQuery(
    contentQuery,
    {
      variables: {
        id: mainContext.item
      }
    }
  );
  if (error) {
    return (<div>{error.message}</div>);
  } else if (data) {
    return (
      <form className={classes.root} noValidate autoComplete="off">
      </form>
    );
  }
  return (<CircularProgress />);
});
