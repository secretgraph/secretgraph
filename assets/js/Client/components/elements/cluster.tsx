

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
import { unserializeToArrayBuffer } from "../../utils/encryption";
import { ViewFrame, DecisionFrame } from "../ElementFrames";


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
  let name: string | null = null, note: string | null = null, cluster_tokens: string[] = [];
  try {
    const store = graph();
    parse((data as any).data.secretgraph.node.publicInfo, store, "https://secretgraph.net/static/schemes");
    const name_note_results = store.querySync(SPARQLToQuery(`SELECT ?name, ?note WHERE {_:cluster a ${CLUSTER("Cluster")}; ${SECRETGRAPH("name")} ?name. OPTIONAL { _:cluster ${SECRETGRAPH("note")} ?note } }`, false, store))
    if(name_note_results.length > 0) {
      name = name_note_results[0][0];
      note = name_note_results[0][1] ? name_note_results[0][1] : "";
    }
    cluster_tokens = store.querySync(SPARQLToQuery(`SELECT ?token WHERE {_:cluster a ${CLUSTER("Cluster")}; ${CLUSTER("Cluster.publicsecrets")} _:pubsecret . _:pubsecret ${CLUSTER("PublicSecret.value")} ?token . }`, false, store)).map((val: any) => val.token)
  } catch(exc){
    console.warn("Could not parse publicInfo", exc, data)
  }
  const privateTokens = [];
  if (
    mainCtx.url &&
    mainCtx.item &&
    config.hosts[mainCtx.url] &&
    config.hosts[mainCtx.url].clusters[mainCtx.item]
  ){
    for(const hash in config.hosts[mainCtx.url].clusters[mainCtx.item].hashes){
      const token = config.tokens[hash];
      if (!token) continue;
      if (cluster_tokens.includes(token)) continue;
      privateTokens.push(token)
    }
  }

  return (
    <ViewFrame
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
              {cluster_tokens.map((token: string, index: number) => (
                <ListItem key={`public:${index}:wrapper`}>
                  <ListItemText>
                    Public Token: {token}
                  </ListItemText>
                </ListItem>
              ))}
              {privateTokens.map((token: string, index: number) => (
                <ListItem key={`public:${index}:wrapper`}>
                  <ListItemText>
                    Private Token: {token}
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
  return (
    <DecisionFrame
      mainCtx={mainCtx}
      add={AddCluster}
      view={ViewCluster}
      edit={EditCluster}
    />
  );
};
