
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import { useQuery, graphql } from 'relay-hooks';
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
  const {props, error, retry, cached} = useQuery(
    contentQuery,
    {
      id: mainContext.item,
    }
  );
  if (error) {
    return (<div>{error.message}</div>);
  } else if (props) {
    return null;
  }
  return (<CircularProgress />);
});

export const DocumentForm = themeComponent((appProps: Props) => {
  const { classes, theme, mainContext, setMainContext } = appProps;
  const {props, error, retry, cached} = useQuery(
    contentQuery,
    {
      id: mainContext.item,
    }
  );
  if (error) {
    return (<div>{error.message}</div>);
  } else if (props) {
    return (
      <form className={classes.root} noValidate autoComplete="off">
      </form>
    );
  }
  return (<CircularProgress />);
});
