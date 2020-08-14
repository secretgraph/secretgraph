
import * as React from "react";
import { Theme } from "@material-ui/core/styles";
import { useQuery } from '@apollo/client';

import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import CircularProgress from '@material-ui/core/CircularProgress';

import { contentQuery } from "../queries/content"
import { MainContext } from '../contexts';

type Props = {
  classes: any,
  theme: Theme,
};

export default themeComponent((appProps: Props) => {
  const { classes, theme } = appProps;
  const {mainCtx, setMainCtx} = React.useContext(MainContext);
  const {data, error} = useQuery(
    contentQuery,
    {
      variables: {
        id: mainCtx.item
      }
    }
  );
  if (error) {
    return (<div>{error.message}</div>);
  } else if (data) {
    return (
      <form className={classes.root} noValidate autoComplete="off">
      </form>
    );
  }
  return (<CircularProgress />);
});
