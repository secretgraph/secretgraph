

import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import { themeComponent } from "../../theme";
import { newClusterLabel } from "../../messages";

type Props = {
  classes: any,
  theme: Theme,
  mainContext: any,
  setMainContext: any
};
export const viewSource = themeComponent((props: Props) => {
  const { classes, theme, mainContext, setMainContext } = props;

  return (
    <div />
  );
});

export const editSource = themeComponent((props: Props) => {
  const { classes, theme, mainContext, setMainContext } = props;

  return (
    <div />
  );
});
