

import * as React from "react";
import { Theme } from "@material-ui/core/styles";
import CircularProgress from '@material-ui/core/CircularProgress';

import { useAsync } from "react-async"
import { saveAs } from 'file-saver';
import { useQuery, useApolloClient } from '@apollo/client';

import { ConfigInterface} from "../../interfaces"
import { MainContext, ConfigContext } from "../../contexts"
import { decryptContentId } from "../../utils/operations"

import { contentQuery } from "../../queries/content"
import { useStylesAndTheme } from "../../theme";
import { newClusterLabel } from "../../messages";

import { ViewFrame, EditFrame } from "../ElementFrames";

type Props = {};

const ViewKeys = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();
  const { mainCtx } = React.useContext(MainContext);
  const client = useApolloClient();
  const { config } = React.useContext(ConfigContext);
  const { data, error } = useAsync({
    promise: decryptContentId(
      client,
      config as ConfigInterface,
      mainCtx.url as string,
      mainCtx.item as string
    ),
    suspense: true
  });
  if(error){
    throw error;
  }
  return (
    <ViewFrame
      shareurl=""
    >

    </ViewFrame>
  );
}

const AddKeys = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <EditFrame
    >

    </EditFrame>
  );
}

const EditKeys = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <EditFrame
      shareurl=""
    >

    </EditFrame>
  );
}

export default function KeyComponent(props: Props) {
  const {mainCtx} = React.useContext(MainContext);
  if( mainCtx.type == "PrivateKey" ) {
    // reload as PublicKey
  }
  if (mainCtx.action == "view" && mainCtx.item) {
    return (
      <ViewKeys/>
    );
  } else if (mainCtx.action == "edit" && mainCtx.item) {
    return (<EditKeys/>)
  } else if (mainCtx.action == "add") {
    return (<AddKeys/>)
  }
  return null;
};
