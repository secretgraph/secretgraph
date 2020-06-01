
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import { themeComponent } from "../theme";
import { newComponentLabel } from "../messages";
import { elements } from '../components/elements';

type Props = {
  classes: any,
  theme: Theme,
  mainContext: any,
  setMainContext: any
};

function SettingsImporter(props: Props) {
  const { classes, theme, mainContext, setMainContext } = props;

  return (
    <React.Fragment>

    </React.Fragment>
  );
}

export default themeComponent(SettingsImporter);
