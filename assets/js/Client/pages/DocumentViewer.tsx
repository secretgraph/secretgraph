
import * as React from "react";
import { Theme } from "@material-ui/core/styles";
import { useQuery } from '@apollo/client';

import { themeComponent } from "../theme";
import { elements } from '../components/elements';
import CircularProgress from '@material-ui/core/CircularProgress';

import { contentQuery } from "../queries/content"
import { getClusterConfigurationQuery } from "../queries/cluster"
import { MainContext, SearchContext } from '../contexts';

type Props = {
  classes: any,
  theme: Theme,
};

export default themeComponent((appProps: Props) => {
  const { classes, theme } = appProps;
  const {mainCtx, setMainCtx} = React.useContext(MainContext);
  const {searchCtx, setSearchCtx} = React.useContext(SearchContext);
  let res : any;
  if (mainCtx.item) {
    res = useQuery(
      contentQuery,
      {
        variables: {
          id: mainCtx.item
        }
      }
    );
  } else {
    res = useQuery(
      getClusterConfigurationQuery,
      {
        variables: {
          id: searchCtx.cluster
        }
      }
    );
  }
  const {data, error} = res;
  if (error) {
    return (<div>{error.message}</div>);
  } else if (data) {
    return null;
  }
  return (<CircularProgress />);
});
