
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import { themeComponent } from "../theme";

type Props = {
  classes: any,
  theme: Theme,
  mainContext: any
};

function Help(props: Props) {
  const { classes, theme, mainContext } = props;

  return (
    <React.Fragment />
  );
}

export default themeComponent(Help);
