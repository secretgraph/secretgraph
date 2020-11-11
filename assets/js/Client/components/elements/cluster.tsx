

import * as React from "react";
import Typography from '@material-ui/core/Typography';
import AddIcon from '@material-ui/icons/Add';
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import Tooltip from '@material-ui/core/Tooltip';
import IconButton from '@material-ui/core/IconButton';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import Collapse from '@material-ui/core/Collapse';

import { Formik, Form, FastField, Field } from 'formik';

import TextareaAutosize from '@material-ui/core/TextareaAutosize';
import { TextField } from 'formik-material-ui';
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
import { EditFrame, ViewFrame, DecisionFrame } from "../ElementFrames";


interface TokenListProps {
  initialOpen: boolean,
  canAdd: boolean,
  privateTokens: [token: string, actions: string[]][],
  publicTokens: string[]
}


const TokenList = (props: TokenListProps) => {
  const { canAdd, initialOpen, privateTokens, publicTokens } = props
  const [ openTokens, setOpenTokens ] = React.useState(initialOpen);
  return (
    <div>
      <div>
        {
          canAdd ? <IconButton aria-label="add" onClick={() => console.log("implement")}>
            <AddIcon />
          </IconButton> : null
        }
        <Typography variant="h4" component="span">
          Tokens
        </Typography>
        {
          <IconButton aria-label="tokens" onClick={() => setOpenTokens(!openTokens)}>
            <MoreVertIcon />
          </IconButton>
        }
      </div>
      <Collapse in={openTokens} timeout="auto">
        <List>
          {publicTokens.map((token: string, index: number) => (
            <ListItem key={`public:${index}:wrapper`}>
              <ListItemText primary={`Public Token: ${token}`}
              />
            </ListItem>
          ))}
          {privateTokens.map(([token, actions] : [token: string, actions: string[]], index: number) => (
            <ListItem key={`private:${index}:wrapper`}>
              <ListItemText
                primary={`Private Token: ${token}`}
                secondary={"allows actions: "+ actions.join(", ")}
              />
            </ListItem>
          ))}
        </List>
      </Collapse>
    </div>
  )
}


const EditClusterIntern = (props: {name: string, note: string, id?: string | null}) => {
  return (
    <Formik
      initialValues={{
        name: props.name,
        note: props.note,
      }}
      onSubmit={(values, { setSubmitting }) => {
        setTimeout(() => {
          setSubmitting(false);
          alert(JSON.stringify(values, null, 2));
        }, 500);
      }}
    >
      <Form>
        <FastField
          component={TextField}
          name="name"
          type="text"
          label="Name"
        />
        <br />
        <FastField
          component={TextareaAutosize}
          name="note"
          type="text"
          label="Note"
        />
      </Form>
    </Formik>
  )

}


const ViewCluster = () => {
  const {config, setConfig} = React.useContext(InitializedConfigContext);
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
    console.error(data, error);
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
  const privateTokens: [string, string[]][] = [];
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
      const actions = config.hosts[mainCtx.url].clusters[mainCtx.item].hashes[hash]
      privateTokens.push([token, actions])
    }
  }

  return (
    <ViewFrame
    >
      <Typography>
        {name ? name : "No Name"}
      </Typography>
      <Typography>
        {note ? note : "No Note"}
      </Typography>
      <TokenList
        publicTokens={cluster_tokens}
        privateTokens={privateTokens}
        initialOpen
        canAdd={false}
      />
    </ViewFrame>
  );
}


const AddCluster = () => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <EditFrame>
      <EditClusterIntern
        name="" note=""
        id={null}
      />
    </EditFrame>
  );
}

const EditCluster = () => {
  const {config, setConfig} = React.useContext(InitializedConfigContext);
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
    console.error(data, error);
    return (
      <EditFrame>
        <EditClusterIntern
          id={mainCtx.item}
          name=""
          note=""
        />
      </EditFrame>
    );
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
  } catch(exc){
    console.warn("Could not parse publicInfo", exc, data)
  }

  return (
    <EditFrame>
      <EditClusterIntern
        id={mainCtx.item}
        name={name || ""}
        note={note || ""}
      />
    </EditFrame>
  );
}

export default function ClusterComponent() {
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
