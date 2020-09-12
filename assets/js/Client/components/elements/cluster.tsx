

import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import { MainContext, ConfigContext } from "../../contexts"
import { getClusterQuery } from "../../queries/cluster"
import { useStylesAndTheme } from "../../theme";
import { newClusterLabel } from "../../messages";


type Props = {
};

const ViewCluster = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <div />
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
