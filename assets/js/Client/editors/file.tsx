

import * as React from "react";
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import { useAsync } from "react-async"

import { saveAs } from 'file-saver';

import { Formik, Form, FastField, Field } from 'formik';

import { TextField as TextFieldFormik} from 'formik-material-ui';
import { useApolloClient, ApolloClient, FetchResult } from '@apollo/client';
import { parse, serialize, graph, SPARQLToQuery, BlankNode, NamedNode, Literal } from 'rdflib';
import { RDF, XSD, CLUSTER, SECRETGRAPH, contentStates } from "../constants"

import { ConfigInterface, MainContextInterface } from "../interfaces";
import { MainContext, ConfigContext } from "../contexts"
import { decryptContentId } from "../utils/operations"

import { contentQuery } from "../queries/content"
import { useStylesAndTheme } from "../theme";
import { newClusterLabel } from "../messages";
import DecisionFrame from "../components/DecisionFrame";


type Props = {};



const ViewFile = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();
  const { mainCtx } = React.useContext(MainContext);
  const { config } = React.useContext(ConfigContext);
  const [blobUrl, setBlobUrl] = React.useState<string | undefined>(undefined)
  const client = useApolloClient();
  const { data, error } = useAsync(
    {
      promiseFn: decryptContentId,
      suspense: true,
      client: client,
      config: config as ConfigInterface,
      url: mainCtx.url as string,
      id: mainCtx.item as string,
      decryptTags: ["mime", "name"]
    }
  )
  React.useEffect(()=> {
    if(!data){
      return;
    }
    const _blobUrl = URL.createObjectURL(data.data)
    setBlobUrl(_blobUrl);
    return () => {
      setBlobUrl(undefined)
      URL.revokeObjectURL(_blobUrl)
    }
  }, [data])
  if (!blobUrl || !data) {
    return null;
  }
  let inner: null | JSX.Element = null;
  switch(data.tags.mime.split("/", 1)[0]){
    case "text":
      // not implemented yet
      break
    case "audio":
    case "video":
      inner = (
        <div>
          <video controls>
            <source src={blobUrl} style={{width:"100%"}}/>
          </video>
        </div>
      )
      break
    case "image":
      inner = (
        <div>
          <a href={blobUrl}>
            <img src={blobUrl} alt={data.tags.name || ""} style={{width:"100%"}}/>
          </a>
        </div>
      )
      break
  }
  return (
    <>
      {inner}
      <div>
        <a  href={blobUrl} type={data.tags.mime} target="_blank">
          <CloudDownloadIcon/>
        </a>
      </div>
    </>
  )
}

const AddFile = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();

  return (
    <React.Fragment>
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
  return (
    <DecisionFrame
      mainCtx={mainCtx}
      add={AddFile}
      view={ViewFile}
      edit={EditFile}
    />
  );
};
