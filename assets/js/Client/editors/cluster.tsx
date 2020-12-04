

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
import Grid from '@material-ui/core/Grid';
import Collapse from '@material-ui/core/Collapse';

import { Formik, Form, FastField, Field } from 'formik';

import { TextField as TextFieldFormik} from 'formik-material-ui';
import { useApolloClient, ApolloClient } from '@apollo/client';
import { parse, serialize, graph, SPARQLToQuery, BlankNode, NamedNode, Literal } from 'rdflib';
import { RDFS, XSD, CLUSTER, SECRETGRAPH, contentStates } from "../constants"

import { ConfigInterface, MainContextInterface } from "../interfaces";
import { MainContext, InitializedConfigContext } from "../contexts"
import { getClusterQuery } from "../queries/cluster"
import { useStylesAndTheme } from "../theme";
import { extractAuthInfo } from "../utils/config";
import { serializeToBase64 } from "../utils/encryption"
import { updateCluster, createCluster } from "../utils/operations";
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


function extractPublicInfo(config:ConfigInterface, node: any, url?: string | null | undefined, id?: string | null | undefined) {
  const privateTokens: [string, string[]][] = [];

  let name: string | null = null, note: string | null = null, publicTokens: string[] = [], publicInfo: string | undefined=node.publicInfo, root: BlankNode | NamedNode | null=null;
  try {
    const store = graph();
    parse(publicInfo as string, store, "https://secretgraph.net/static/schemes");
    const name_note_results = store.querySync(SPARQLToQuery(`SELECT ?name, ?note WHERE {_:cluster a ${CLUSTER("Cluster")}; ${SECRETGRAPH("name")} ?name. OPTIONAL { _:cluster ${SECRETGRAPH("note")} ?note } }`, false, store))
    if(name_note_results.length > 0) {
      root = name_note_results[0][0];
      name = name_note_results[0][1];
      note = name_note_results[0][2] ? name_note_results[0][2] : "";
    }
    publicTokens = store.querySync(SPARQLToQuery(`SELECT ?token WHERE {_:cluster a ${CLUSTER("Cluster")}; ${CLUSTER("Cluster.publicsecrets")} _:pubsecret . _:pubsecret ${CLUSTER("PublicSecret.value")} ?token . }`, false, store)).map((val: any) => val.token)
  } catch(exc){
    console.warn("Could not parse publicInfo", exc, node)
    publicInfo = undefined
  }
  if (
    url &&
    id &&
    config.hosts[url] &&
    config.hosts[url].clusters[id]
  ){
    for(const hash in config.hosts[url].clusters[id].hashes){
      const token = config.tokens[hash];
      if (!token) continue;
      if (publicTokens.includes(token)) continue;
      const actions = config.hosts[url].clusters[id].hashes[hash]
      privateTokens.push([token, actions])
    }
  }
  return {
    publicInfo,
    publicTokens,
    privateTokens,
    name,
    note,
    url,
    id
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
  readonly publicInfo?: string
  name: string | null
  note: string | null
  id?: string | null
  url?: string | null | undefined
  updateId?: string | null | undefined
  disabled?: boolean | undefined
  publicTokens: string[]
  privateTokens: [token: string, actions: string[]][]
  keys: string[]
}

const ClusterIntern = (props: ClusterInternProps) => {
  let root = new BlankNode();
  const client = useApolloClient();
  const {config, updateConfig} = React.useContext(InitializedConfigContext);
  const [ updateId, setUpdateId ] = React.useState(props.updateId);
  return (
      <Formik
        initialValues={{
          name: props.name || "",
          note: props.note || "",
        }}
        onSubmit={async (values, { setSubmitting, setValues }) => {
          const store = graph();
          if(props.publicInfo){
            parse(props.publicInfo as string, store, "_:");
            const results = store.querySync(SPARQLToQuery(`SELECT ?root WHERE {?root a ${CLUSTER("Cluster")}. }`, false, store))
            root = (results[0] && results[0][0]) || root;
          }
          store.removeMany(root, SECRETGRAPH("name"))
          store.removeMany(root, SECRETGRAPH("note"))
          store.add(root, SECRETGRAPH("name"), new Literal(values.name || "", null, XSD("string")));
          store.add(root, SECRETGRAPH("note"), new Literal(values.note || "", null, XSD("string")));
          let clusterResponse;
          if(props.id){
            clusterResponse = await updateCluster({
              id: props.id as string,
              client,
              updateId: props.updateId as string,
              publicInfo: serialize(null as any, store, "_:", "text/turtle"),
              authorization: props.keys
            })
          } else {
            const key = crypto.getRandomValues(new Uint8Array(32));
            const { publicKey, privateKey } = (await crypto.subtle.generateKey(
              {
                name: "RSA-OAEP",
                //modulusLength: 8192,
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: config.hosts[config.baseUrl].hashAlgorithms[0],
              },
              true,
              ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
            )) as CryptoKeyPair;
            const digestCertificatePromise = crypto.subtle
              .exportKey("spki" as const, publicKey)
              .then((keydata) =>
                crypto.subtle
                  .digest(config.hosts[config.baseUrl].hashAlgorithms[0], keydata)
                  .then((data) => btoa(String.fromCharCode(...new Uint8Array(data))))
              );
            const digestActionKeyPromise = crypto.subtle
              .digest(
                config.hosts[config.baseUrl].hashAlgorithms[0],
                crypto.getRandomValues(new Uint8Array(32))
              )
              .then((data) => btoa(String.fromCharCode(...new Uint8Array(data))));
            const keyb64 = btoa(String.fromCharCode(...key));
            clusterResponse = await createCluster({
              client,
              actions: [{ value: '{"action": "manage"}', key: keyb64 }],
              publicInfo: "",
              hashAlgorithm: config.hosts[config.baseUrl].hashAlgorithms[0],
              publicKey,
              privateKey,
              privateKeyKey: key,
            });
            if (!clusterResponse.errors && clusterResponse.data){
              const [digestActionKey, digestCertificate] = await Promise.all([
                digestActionKeyPromise,
                digestCertificatePromise,
              ]);
              const newNode = clusterResponse.data.data.secretgraph.node;
              const configUpdate = {
                hosts: {
                  [props.url as string]: {
                    hashAlgorithms: clusterResponse.data.data.secretgraph.config.hashAlgorithms,
                    clusters: {
                      [newNode.id as string]: {
                        hashes: {
                          [digestActionKey]: ["manage", "create", "update"],
                          [digestCertificate]: []
                        }
                      }
                    }
                  }
                },
                tokens: {
                  [digestActionKey]: keyb64,
                  [digestCertificate]: await serializeToBase64(
                    privateKey
                  )
                }
              }
              updateConfig(configUpdate);
            }
          }
          if (clusterResponse.errors || !clusterResponse.data){
            setSubmitting(false);
            return;
          }
          console.log(clusterResponse.data)
          const extracted = extractPublicInfo(config, clusterResponse.data?.updateOrCreateCluster.cluster, props.url, props.id);
          setUpdateId(clusterResponse.data?.updateOrCreateCluster.cluster.updateId)
          setValues({
            name: extracted.name || "",
            note: extracted.note || ""
          });
          setSubmitting(false);
        }}
      >
        {({ submitForm, isSubmitting }) => (
          <Form>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FastField
                  component={TextFieldFormik}
                  name="name"
                  type="text"
                  label="Name"
                  fullWidth
                  disabled={props.disabled || isSubmitting}
                />
              </Grid>

              <Grid item xs={12}>
                <FastField
                  component={TextFieldFormik}
                  name="note"
                  type="text"
                  label="Note"
                  fullWidth
                  multiline
                  disabled={props.disabled || isSubmitting}
                />
              </Grid>
              <Grid item xs={12}>
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
              </Grid>
              <Grid item xs={12}>
                <TokenList
                  publicTokens={props.publicTokens}
                  privateTokens={props.privateTokens}
                  initialOpen
                  disabled={props.disabled || isSubmitting}
                />
              </Grid>
            </Grid>
          </Form>
        )}
      </Formik>
  )

}

const ViewCluster = () => {
  const {mainCtx, updateMainCtx} = React.useContext(MainContext);
  const {config, updateConfig} = React.useContext(InitializedConfigContext);
  const client = useApolloClient();
  const authinfo = extractAuthInfo({config, url: mainCtx.url as string, require: ["view", "manage"]});
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
    updateMainCtx({shareUrl: data?.data.secretgraph.node.link})
  }


  return (
    <ClusterIntern
      {...  extractPublicInfo(config, data?.data?.secretgraph?.node, mainCtx.url, mainCtx.item)} disabled
      keys={authinfo.keys}
    />
  )
}

const AddCluster = () => {
  const {classes, theme} = useStylesAndTheme();
  const {mainCtx} = React.useContext(MainContext);
  const {config} = React.useContext(InitializedConfigContext);
  const authinfo = extractAuthInfo({config, url: mainCtx.url as string, require: ["manage"]});

  return (
    <ClusterIntern
      name="" note="" publicTokens={[]}
      privateTokens={[]}
      id={null}
      keys={authinfo.keys}
    />
  );
}

const EditCluster = () => {
  const {config} = React.useContext(InitializedConfigContext);
  const {mainCtx, updateMainCtx} = React.useContext(MainContext);
  const client = useApolloClient();
  const authinfo = extractAuthInfo({config, clusters:[mainCtx.item as string], url: mainCtx.url as string, require: ["manage"]});
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
        keys={authinfo.keys}
      />
    );
  }
  if (!data?.data?.secretgraph?.node){
    return (
        <ClusterIntern
          name="" note="" publicTokens={[]}
          privateTokens={[]}

          id={mainCtx.item}
          keys={authinfo.keys}
        />
    );
  }
  console.log(data);

  return (
    <ClusterIntern
      {...  extractPublicInfo(config, data.data?.secretgraph?.node, mainCtx.url, mainCtx.item)}
      keys={authinfo.keys}
      updateId={data.data?.secretgraph.node.updateId}
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
