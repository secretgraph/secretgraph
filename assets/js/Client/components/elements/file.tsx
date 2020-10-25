

import * as React from "react";
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';

import { useAsync } from "react-async"
import { saveAs } from 'file-saver';
import { useQuery, useApolloClient } from '@apollo/client';

import { ViewFrame } from "../ElementFrames";

import { ConfigInterface} from "../../interfaces"
import { MainContext, ConfigContext } from "../../contexts"
import { decryptContentId } from "../../utils/operations"

import { contentQuery } from "../../queries/content"
import { useStylesAndTheme } from "../../theme";
import { newClusterLabel } from "../../messages";


type Props = {};

const ViewFile = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();
  const { mainCtx } = React.useContext(MainContext);
  const { config } = React.useContext(ConfigContext);
  const client = useApolloClient();
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
  /**
  saveAs(
    new File(
      [newConfig],
      name,
      {type: "text/plain;charset=utf-8"}
    )
  );
  {% if type == "image" %}
  <a href="{{download}}">
    <img src="{{download}}" alt="{{object.associated.name}}" style="width:100%"/>
  </a>
{% elif type == "media" %}
  <video controls>
    <source src="{{download}}" style="width:100%">
    {% trans 'Format not supported' %}
  </video>
{% else %}
  <div style="width:100%" class="w3-padding w3-center">
    <a class="w3-margin" href="{{download}}">
      <i class="fas fa-file-download" style="font-size:300px;color: red;" aria-hidden="true"></i>
    </a>
  </div>
{% endif %}
 */
  return (
    <ViewFrame
    >

    </ViewFrame>
  );
}

const AddFile = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <React.Fragment>
      <Card>
        <CardContent>

        </CardContent>
      </Card>

    </React.Fragment>
  );
}

const EditFile = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <React.Fragment>
      <Card>
        <CardContent>

        </CardContent>
      </Card>

    </React.Fragment>
  );
}

export default function FileComponent(props: Props) {
  const {mainCtx} = React.useContext(MainContext);
  if (mainCtx.action == "view" && mainCtx.item) {
    return (
      <ViewFile/>
    );
  } else if (mainCtx.action == "edit" && mainCtx.item) {
    return (<EditFile/>)
  } else if (mainCtx.action == "add") {
    return (<AddFile/>)
  }
  return null;
};
