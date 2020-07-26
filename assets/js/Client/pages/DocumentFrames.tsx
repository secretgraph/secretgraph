
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import {QueryRenderer, graphql} from 'react-relay';
import { useRelayEnvironment } from 'react-relay/hooks';
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


export const DocumentViewer = themeComponent((props: Props) => {
  const { classes, theme, config, setConfig, mainContext, setMainContext } = props;
  const environment = useRelayEnvironment();

  return (
    <QueryRenderer
      environment={environment}
      query={contentQuery}
      variables={{
        id: mainContext.item,
      }}
      render={(result: any) => renderQueryWrapper({...props, ...result})}
    />
  );
});

export const DocumentForm = themeComponent((props: Props) => {
  const { classes, theme, mainContext, setMainContext } = props;
  const environment = useRelayEnvironment();

  return (
    <form className={classes.root} noValidate autoComplete="off">
      <QueryRenderer
        environment={environment}
        query={contentQuery}
        variables={{
          id: mainContext.item,
        }}
        render={(result: any) => renderQueryWrapper({...props, ...result})}
      />
    </form>
  );
});
