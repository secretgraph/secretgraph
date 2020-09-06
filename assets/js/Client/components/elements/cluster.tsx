

import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import { themeComponent } from "../../theme";
import { newClusterLabel } from "../../messages";

type Props = {
  classes: any,
  theme: Theme,
};
export const viewSource = themeComponent((props: Props) => {
  const { classes, theme } = props;

  return (
    <div />
  );
});

const editSource = themeComponent((props: Props) => {
  const { classes, theme } = props;

  return (
    <div />
  );
});

export default function clusterComponent(props: Props) {
  return (
      <div />
  );
};
