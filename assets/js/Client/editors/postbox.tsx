

import * as React from "react";

import { saveAs } from 'file-saver';
import { useQuery, useApolloClient } from '@apollo/client';

import { ConfigInterface} from "../interfaces"
import { MainContext, ConfigContext } from "../contexts"
import { decryptContentId } from "../utils/operations"

import { contentQuery } from "../queries/content"
import { useStylesAndTheme } from "../theme";
import { newClusterLabel } from "../messages";

import DecisionFrame from "../components/DecisionFrame";

type Props = {};

const ViewPostbox = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();
  const { mainCtx } = React.useContext(MainContext);
  const client = useApolloClient();
  const { config } = React.useContext(ConfigContext);
  decryptContentId(
    client,
    config as ConfigInterface,
    mainCtx.url as string,
    mainCtx.item as string
  )
  return (
    <></>
  );
}

const AddPostbox = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <></>
  );
}

const EditPostbox = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <></>
  );
}

export default function PostboxComponent(props: Props) {
  const {mainCtx} = React.useContext(MainContext);
  if (mainCtx.action == "view" && mainCtx.item) {
    return (
      <ViewPostbox/>
    );
  } else if (mainCtx.action == "edit" && mainCtx.item) {
    return (<EditPostbox/>)
  } else if (mainCtx.action == "add") {
    return (<AddPostbox/>)
  }
  return null;
};
