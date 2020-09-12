

import * as React from "react";
import { Theme } from "@material-ui/core/styles";
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';


import { MainContext } from "../contexts"
import { useStylesAndTheme } from "../theme";


type ViewProps = {
  shareurl: string,
  nopwtoken?: string,
  // special attribute
  children: any
};

export const ViewFrame = (props: ViewProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { children} = props;

  return (
    <React.Fragment>
      <Card>
        <CardContent>
          {children}
        </CardContent>
      </Card>

    </React.Fragment>
  );
}


type EditProps = {
  shareurl?: string,
  nopwtoken?: string,
  // special attribute
  children: any
};

export const EditFrame = (props: EditProps) => {
  const {classes, theme} = useStylesAndTheme();
  const { children } = props;

  return (
    <React.Fragment>
      <Card>
        <CardContent>
          {children}
        </CardContent>
      </Card>

    </React.Fragment>
  );
}
