

import * as React from "react";
import Typography from '@material-ui/core/Typography';
import AddIcon from '@material-ui/icons/Add';
import Card from '@material-ui/core/Card';
import CardHeader from '@material-ui/core/CardHeader';
import CardContent from '@material-ui/core/CardContent';
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import IconButton from '@material-ui/core/IconButton';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import Collapse from '@material-ui/core/Collapse';
import { useAsync } from "react-async"
import { useApolloClient } from '@apollo/client';
import { parse, graph, SPARQLToQuery } from 'rdflib';
import { RDFS, CLUSTER, SECRETGRAPH, contentStates } from "../../constants"

import { ConfigInterface } from "../../interfaces";
import { MainContext, InitializedConfigContext } from "../../contexts"
import { getClusterQuery } from "../../queries/cluster"
import { useStylesAndTheme } from "../../theme";
import { extractAuthInfo } from "../../utils/config";
import { ViewFrame } from "../ElementFrames";


type Props = {
};

const ViewCluster = (props: Props) => {
  const {config, setConfig} = React.useContext(InitializedConfigContext);
  const [ openTokens, setOpenTokens ] = React.useState(false);
  const {classes, theme} = useStylesAndTheme();
  const {mainCtx} = React.useContext(MainContext);
  const client = useApolloClient();
  const authinfo = extractAuthInfo(config, mainCtx.url as string);
  const { data, error } = useAsync({
    promise: client.query({
      query: getClusterQuery,
      variables: {
        id: mainCtx.item,
        authorization: authinfo.keys
      }
    }),
    suspense: true
  });
  if (!data){
    console.error(error);
    return null;
  }
  const url = new URL(config.baseUrl);
  let name: string | null = null, note: string | null = null;
  try {
    const store = graph();
    parse((data as any).data.secretgraph.node.publicInfo, store, "https://secretgraph.net/static/schemes");
    const name_note_results = store.querySync(SPARQLToQuery(`SELECT ?name, ?note WHERE {_:cluster a ${CLUSTER("Cluster")}; ${SECRETGRAPH("name")} ?name. OPTIONAL { _:cluster ${SECRETGRAPH("note")} ?note } }`, false, store))
    if(name_note_results.length > 0) {
      name = name_note_results[0][0];
      note = name_note_results[0][1] ? name_note_results[0][1] : "";
    }
    const token_results = store.querySync(SPARQLToQuery(`SELECT ?token WHERE {_:cluster a ${CLUSTER("Cluster")}; ${CLUSTER("Cluster.publicsecrets")} _:pubsecret . _:pubsecret ${CLUSTER("PublicSecret.value")} ?token . }`, false, store))
  } catch(exc){
    console.warn("Could not parse publicInfo", exc, data)
  }

  return (
    <ViewFrame
      shareurl={`${url.origin}${(data as any).data.secretgraph.node.link}`}
    >
      <Typography>
        {name}
      </Typography>
      <Card>
        <CardContent>
          {note}
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          avatar={
            <IconButton aria-label="add" onClick={() => console.log("implement")}>
              <AddIcon />
            </IconButton>
          }
          action={
            <IconButton aria-label="tokens" onClick={() => setOpenTokens(!openTokens)}>
              <MoreVertIcon />
            </IconButton>
          }
          title="Tokens"
        />
        <Collapse in={openTokens} timeout="auto">
          <CardContent>
            <List>
              {token_results.map((publicsecret: any, index: number) => (
                <ListItem key={`${index}:wrapper`}>
                  <ListItemText>
                    Public Token: {publicsecret.token}
                  </ListItemText>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Collapse>
      </Card>

    </ViewFrame>
  );
}

const AddCluster = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <div />
  );
}

const EditCluster = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <div />
  );
}

export default function ClusterComponent(props: Props) {
  const {mainCtx} = React.useContext(MainContext);
  try{
    if (mainCtx.action == "view" && mainCtx.item) {
      return (<ViewCluster/>)
    } else if (mainCtx.action == "edit" && mainCtx.item) {
      return (<EditCluster/>)
    } else if (mainCtx.action == "add") {
      return (<AddCluster/>)
    }
  } catch (exc) {
    console.error(exc);
    return (
      <Typography color="textPrimary" gutterBottom paragraph>
        {exc}
      </Typography>
    )
  }
  return null;
};
