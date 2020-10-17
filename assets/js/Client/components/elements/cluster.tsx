

import * as React from "react";
import Paper from '@material-ui/core/Paper';
import Grid from '@material-ui/core/Grid';
import { useAsync } from "react-async"
import { useQuery, useApolloClient } from '@apollo/client';

import { ConfigInterface } from "../../interfaces";
import { MainContext, ConfigContext } from "../../contexts"
import { getClusterQuery } from "../../queries/cluster"
import { useStylesAndTheme } from "../../theme";
import { extractAuthInfo } from "../../utils/config";
import { ViewFrame } from "../ElementFrames";


type Props = {
};

const ViewCluster = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();
  const {mainCtx} = React.useContext(MainContext);
  const {config, setConfig} = React.useContext(ConfigContext);
  const client = useApolloClient();
  const authinfo = extractAuthInfo(config as ConfigInterface, mainCtx.url as string);
  const { data, error } = useAsync({
    promise: client.query({
      query: getClusterQuery,
      variables: {
        id: mainCtx.item,
        authorization: authinfo
      }
    }),
    suspense: true
  });

  return (
    <ViewFrame
    shareurl=""
    >
      <Grid container spacing={5}>
        <Grid item xs={12} md={6}>
          Name
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper>xs=12</Paper>
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <Paper>xs=12</Paper>
        </Grid>
        <Grid item xs={12} md={6} lg={4}>
          <Paper>xs=12</Paper>
        </Grid>
      </Grid>

    </ViewFrame>
  );
}

const AddCluster = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <div />
  );
}

const EditCluster = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <div />
  );
}

export default function ClusterComponent(props: Props) {
  const {mainCtx} = React.useContext(MainContext);
  if (mainCtx.action == "view" && mainCtx.item) {
    return (<ViewCluster/>)
  } else if (mainCtx.action == "edit" && mainCtx.item) {
    return (<EditCluster/>)
  } else if (mainCtx.action == "add") {
    return (<AddCluster/>)
  }
  return null;
};
