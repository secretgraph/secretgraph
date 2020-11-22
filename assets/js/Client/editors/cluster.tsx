

import * as React from "react";
import Typography from '@material-ui/core/Typography';
import AddIcon from '@material-ui/icons/Add';
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import { useAsync } from "react-async"
import Button from '@material-ui/core/Button';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import Tooltip from '@material-ui/core/Tooltip';
import IconButton from '@material-ui/core/IconButton';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import Collapse from '@material-ui/core/Collapse';

import { Formik, Form, FastField, Field } from 'formik';

import TextareaAutosize from '@material-ui/core/TextareaAutosize';
import { TextField as TextFieldFormik} from 'formik-material-ui';
import { useApolloClient, ApolloClient } from '@apollo/client';
import { parse, graph, SPARQLToQuery } from 'rdflib';
import { RDFS, CLUSTER, SECRETGRAPH, contentStates } from "../constants"

import { ConfigInterface, MainContextInterface } from "../interfaces";
import { MainContext, InitializedConfigContext } from "../contexts"
import { getClusterQuery } from "../queries/cluster"
import { useStylesAndTheme } from "../theme";
import { extractAuthInfo } from "../utils/config";
import DecisionFrame from "../components/DecisionFrame";



function item_retrieval_helper(
  {client, keys, item} : {
    client: ApolloClient<any>,
    keys: string[],
    item: string
  }
) {
  return client.query({
    query: getClusterQuery,
    variables: {
      id: item,
      authorization: keys
    }
  })
}


function extractPublicInfo(config:ConfigInterface, mainCtx: MainContextInterface, data: any) {
  const privateTokens: [string, string[]][] = [];

  let name: string | null = null, note: string | null = null, publicTokens: string[] = [];
  try {
    const store = graph();
    parse(data.data.secretgraph.node.publicInfo, store, "https://secretgraph.net/static/schemes");
    const name_note_results = store.querySync(SPARQLToQuery(`SELECT ?name, ?note WHERE {_:cluster a ${CLUSTER("Cluster")}; ${SECRETGRAPH("name")} ?name. OPTIONAL { _:cluster ${SECRETGRAPH("note")} ?note } }`, false, store))
    if(name_note_results.length > 0) {
      name = name_note_results[0][0];
      note = name_note_results[0][1] ? name_note_results[0][1] : "";
    }
    publicTokens = store.querySync(SPARQLToQuery(`SELECT ?token WHERE {_:cluster a ${CLUSTER("Cluster")}; ${CLUSTER("Cluster.publicsecrets")} _:pubsecret . _:pubsecret ${CLUSTER("PublicSecret.value")} ?token . }`, false, store)).map((val: any) => val.token)
  } catch(exc){
    console.warn("Could not parse publicInfo", exc, data)
  }
  if (
    mainCtx.url &&
    mainCtx.item &&
    config.hosts[mainCtx.url] &&
    config.hosts[mainCtx.url].clusters[mainCtx.item]
  ){
    for(const hash in config.hosts[mainCtx.url].clusters[mainCtx.item].hashes){
      const token = config.tokens[hash];
      if (!token) continue;
      if (publicTokens.includes(token)) continue;
      const actions = config.hosts[mainCtx.url].clusters[mainCtx.item].hashes[hash]
      privateTokens.push([token, actions])
    }
  }
  return {
    publicTokens,
    privateTokens,
    name,
    note,
    id: mainCtx.item
  }
}



interface TokenListProps {
  initialOpen: boolean,
  disabled?: boolean,
  privateTokens: [token: string, actions: string[]][],
  publicTokens: string[]
}


const TokenList = ({ disabled, initialOpen, privateTokens, publicTokens }: TokenListProps) => {
  const [ openTokens, setOpenTokens ] = React.useState(initialOpen);
  return (
    <div>
      <div>
        {
          !disabled ? <IconButton aria-label="add" onClick={() => console.log("implement")}>
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


interface ClusterInternProps {
  name: string | null
  note: string | null
  id?: string | null
  disabled?: boolean | undefined
  publicTokens: string[]
  privateTokens: [token: string, actions: string[]][]
}

const ClusterIntern = (props: ClusterInternProps) => {

  return (
      <Formik
        initialValues={{
          name: props.name || "",
          note: props.note || "",
        }}
        onSubmit={async (values, { setSubmitting }) => {
          setTimeout(() => {
            setSubmitting(false);
            alert(JSON.stringify(values, null, 2));
          }, 500);
        }}
      >
        {({ submitForm, isSubmitting }) => (
          <Form>
            <FastField
              component={TextFieldFormik}
              name="name"
              type="text"
              label="Name"
              fullWidth
              disabled={props.disabled || isSubmitting}
            />
            <br />
            <FastField
              component={TextareaAutosize}
              name="note"
              type="text"
              label="Note"
              rowsMin={12}
              disabled={props.disabled || isSubmitting}
            />
            {
            props.disabled ? null : (
              <Button
                variant="contained"
                color="primary"
                disabled={isSubmitting}
                onClick={submitForm}
              >
                Submit
              </Button>
              )
            }
            <TokenList
              publicTokens={props.publicTokens}
              privateTokens={props.privateTokens}
              initialOpen
              disabled={props.disabled || isSubmitting}
            />
          </Form>
        )}
      </Formik>
  )

}

const ViewCluster = () => {
  const {mainCtx, updateMainCtx} = React.useContext(MainContext);
  const {config, updateConfig} = React.useContext(InitializedConfigContext);
  const client = useApolloClient();
  const authinfo = extractAuthInfo(config, mainCtx.url as string);
  const { data, error } = useAsync(
    {
      promiseFn: item_retrieval_helper,
      suspense: true,
      client: client,
      keys: authinfo.keys,
      item: mainCtx.item
    }
  )
  if (!data && !error) {
    return null;
  }
  if (!data && error){
    console.error("Error", data, error);
    return null;
  }
  if (!(data as any).data.secretgraph.node){
    console.error("Node empty", data, authinfo)
    return null;
  }
  if (!mainCtx.shareUrl){
    updateMainCtx({shareUrl: (data as any).data.secretgraph.node.link})
  }


  return (
    <ClusterIntern
      {...  extractPublicInfo(config, mainCtx, data)} disabled
    />
  )
}

const AddCluster = () => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <ClusterIntern
      name="" note="" publicTokens={[]}
      privateTokens={[]}
      id={null}
    />
  );
}

const EditCluster = () => {
  const {config} = React.useContext(InitializedConfigContext);
  const {mainCtx, updateMainCtx} = React.useContext(MainContext);
  const client = useApolloClient();
  const authinfo = extractAuthInfo(config, mainCtx.url as string);
  const { data, error } = useAsync(
    {
      promiseFn: item_retrieval_helper,
      suspense: true,
      client: client,
      keys: authinfo.keys,
      item: mainCtx.item
    }
  )
  if (!data && !error) {
    return null;
  }
  if (!mainCtx.shareUrl){
    updateMainCtx({shareUrl: (data as any).data.secretgraph.node.link})
  }
  if (!data && error){
    console.error(data, error);
    return (
      <ClusterIntern
        name="" note="" publicTokens={[]}
        privateTokens={[]}
        id={mainCtx.item}
      />
    );
  }
  if (!(data as any).data.secretgraph.node){
    return (
        <ClusterIntern
          name="" note="" publicTokens={[]}
          privateTokens={[]}
          id={mainCtx.item}
        />
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
    <ClusterIntern
      {...  extractPublicInfo(config, mainCtx, data)}
    />
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
