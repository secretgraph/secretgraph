

import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import { useStylesAndTheme } from "../../theme";
import { newClusterLabel } from "../../messages";
import { MainContext, ConfigContext } from "../../contexts"

type Props = {};
const ViewCustom = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <div />
  );
}

const AddCustom = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <div />
  );
}

const EditCustom = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <div />
  );
}


export default function CustomComponent(props: Props) {
  const {mainCtx} = React.useContext(MainContext);
  if (mainCtx.action == "view" && mainCtx.item) {
    return (
      <ViewCustom/>
    );
  } else if (mainCtx.action == "edit" && mainCtx.item) {
    return (<EditCustom/>)
  } else if (mainCtx.action == "add") {
    return (<AddCustom/>)
  }
  return null;
};
