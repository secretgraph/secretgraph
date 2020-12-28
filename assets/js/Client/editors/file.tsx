

import * as React from "react";
import CloudDownloadIcon from '@material-ui/icons/CloudDownload';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Button from '@material-ui/core/Button';
import Grid from '@material-ui/core/Grid';
import { useAsync } from "react-async"

import { saveAs } from 'file-saver';

import { Formik, Form, FastField, Field, } from 'formik';

import { TextField as TextFieldFormik, SimpleFileUpload as SimpleFileUploadFormik} from 'formik-material-ui';
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
      if (data.tags.mime == "text/html"){
        // sanitize and render
        inner = (
          <div>
            <pre>
              {data.data}
            </pre>
          </div>
        )
      } else {
        inner = (
          <div>
            <pre>
              {data.data}
            </pre>
          </div>
        )

      }
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
  const { mainCtx } = React.useContext(MainContext);

  return (
    <Formik
      initialValues={{
        plainInput: "",
        htmlInput: "",
        fileInput: null as (null | File)
      }}

      onSubmit={async (values, { setSubmitting, setValues }) => {

      }}
    >
    {({ submitForm, isSubmitting, values, setValues}) => (
      <Grid container spacing={1}>
        { mainCtx.type != "text" ? (
          <Grid item xs={12} sm={!values.plainInput && !values.htmlInput && !values.fileInput ? 6 : undefined}>
            <Field
              component={TextFieldFormik}
              name="plainInput"
              fullWidth
              multiline
              disabled={isSubmitting || values.htmlInput || values.fileInput}
            />
          </Grid>
        ) : null}
        <Grid item xs={12} sm={!values.plainInput && !values.htmlInput && !values.fileInput && mainCtx.type != "text" ? 6 : undefined}>
          <Field
            name="htmlInput"
            fullWidth
            multiline
            disabled={isSubmitting || values.plainInput || values.fileInput}
          >
          </Field>
        </Grid>
        { mainCtx.type != "text" ? (
          <Grid item xs={12}>
            <Field
              component={SimpleFileUploadFormik}
              name="fileInput"
              disabled={isSubmitting|| values.plainInput || values.htmlInput}
            >
              <Button>Upload</Button>
              <Button onClick={() => setValues({...values, fileInput: null})}>Clear</Button>
            </Field>
          </Grid>
        ) : null}
        <Grid item xs={12}>
          {/* linear progress */}
        </Grid>
        <Grid item xs={12}>
          <Button
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            onClick={submitForm}
          >
            Submit
          </Button>
        </Grid>
      </Grid>
    )}
    </Formik>
  );
}

const EditFile = (props: Props) => {
  const {classes, theme} = useStylesAndTheme();
  const { mainCtx } = React.useContext(MainContext);


  return (
    <Formik
      initialValues={{
        plainInput: "",
        htmlInput: "",
        fileInput: null as (null | File)
      }}

      onSubmit={async (values, { setSubmitting, setValues }) => {

      }}
    >
    {({ submitForm, isSubmitting, values, setValues}) => (
      <Grid container spacing={1}>
        <Grid item xs={12} sm={!values.plainInput && !values.htmlInput && !values.fileInput ? 6 : undefined}>
          <Field
            component={TextFieldFormik}
            name="plainInput"
            fullWidth
            multiline
            disabled={isSubmitting || values.htmlInput || values.fileInput}
          />
        </Grid>
        <Grid item xs={12} sm={!values.plainInput && !values.htmlInput && !values.fileInput ? 6 : undefined}>
          <Field
            name="htmlInput"
            fullWidth
            multiline
            disabled={isSubmitting || values.plainInput || values.fileInput}
          >
          </Field>
        </Grid>
        <Grid item xs={12}>
          <Field
            component={SimpleFileUploadFormik}
            name="fileInput"
            disabled={isSubmitting|| values.plainInput || values.htmlInput}
          >
            <Button>Upload</Button>
            <Button onClick={() => setValues({...values, fileInput: null})}>Clear</Button>
          </Field>
        </Grid>
        <Grid item xs={12}>
          {/* linear progress */}
        </Grid>
        <Grid item xs={12}>
          <Button
            variant="contained"
            color="primary"
            disabled={isSubmitting}
            onClick={submitForm}
          >
            Submit
          </Button>
        </Grid>
      </Grid>
    )}
    </Formik>
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
