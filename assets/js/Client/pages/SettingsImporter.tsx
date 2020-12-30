
import * as React from "react";

import TextField from '@material-ui/core/TextField';
import FormControl from '@material-ui/core/FormControl';
import FormHelperText from '@material-ui/core/FormHelperText';
import CircularProgress from '@material-ui/core/CircularProgress';
import SystemUpdateAltIcon from '@material-ui/icons/SystemUpdateAlt';
import Snackbar from '@material-ui/core/Snackbar';
import MuiAlert from '@material-ui/lab/Alert';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import Card from '@material-ui/core/Card';
import CardActions from '@material-ui/core/CardActions';
import CardContent from '@material-ui/core/CardContent';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import CheckIcon from '@material-ui/icons/Check';

import { useStylesAndTheme } from "../theme";
import {
  startHelp,
  startLabel,
  importStartLabel,
  importFileLabel,
  importHelp,
  decryptingPasswordLabel,
  decryptingPasswordHelp
} from "../messages";
import { ConfigInterface, SnackMessageInterface } from '../interfaces';
import { loadConfig, saveConfig, checkConfigObject } from "../utils/config";
import { createClient } from "../utils/graphql";
import { initializeCluster } from "../utils/operations";
import { serverConfigQuery } from "../queries/server"
import { mapHashNames } from "../constants"
import { MainContext, ConfigContext, ActiveUrlContext } from '../contexts';


function Alert(props: any) {
  return <MuiAlert elevation={6} variant="filled" {...props} />;
}

function checkInputs(needsPw: boolean, hasPw: boolean) {
  return (
    (document.getElementById("secretgraph-import-url") as HTMLInputElement)?.value ||
    (
      (document.getElementById("secretgraph-import-file") as HTMLInputElement)?.files &&
      (
        !needsPw || hasPw
      )
    )
  )
}

function SettingsImporter() {
  const {classes, theme} = useStylesAndTheme();
  const [registerUrl, setRegisterUrl] = React.useState(undefined);
  const [loadingStart, setLoadingStart] = React.useState(false);
  const [loadingImport, setLoadingImport] = React.useState(false);
  const [needsPw, setNeedsPw] = React.useState(false);
  const [hasPw, setHasPw] = React.useState(false);
  const [oldConfig, setOldConfig] = React.useState(null) as [ConfigInterface | null, any];
  const [loginUrl, setLoginUrl] = React.useState(undefined);
  const [message, setMessage] = React.useState(undefined) as [SnackMessageInterface | undefined, any];
  const [hasFile, setHasFile] = React.useState(false);
  const mainElement = document.getElementById("content-main");
  const defaultPath: string | undefined = mainElement ? mainElement.dataset.graphqlPath : undefined;
  const {mainCtx, updateMainCtx} = React.useContext(MainContext);
  const {activeUrl, updateActiveUrl} = React.useContext(ActiveUrlContext);
  const {config, updateConfig} = React.useContext(ConfigContext);

  const handleSecretgraphEvent_inner = async (event: any) => {
    const providerUrl = (document.getElementById("secretgraph-provider") as HTMLInputElement).value;
    let newConfig: ConfigInterface | null = null;
    const client = createClient(providerUrl);
    if (!client) {
      setLoadingImport(false);
      return;
    }
    const result = await client.query(
      {query: serverConfigQuery}
    );
    if (!result){
      setLoadingImport(false);
      return;
    }
    const sconfig = result.data.secretgraph.config;
    const hashAlgos = [];
    for(const algo of sconfig.hashAlgorithms){
      const mappedName = mapHashNames[algo];
      if (mappedName){
        hashAlgos.push(mappedName.operationName);
      }
    }
    if (!hashAlgos){
      setMessage({ severity: "warning", message: "unsupported hash algorithm" });
      setLoadingImport(false);
      return
    }
    if (event.pingCreate){
      newConfig = {
        certificates: {},
        tokens: {},
        hosts: {},
        baseUrl: (new URL(providerUrl, window.location.href)).href,
        configHashes: [],
        configCluster: ""
      };
      newConfig.hosts[newConfig.baseUrl] = {hashAlgorithms: hashAlgos, clusters: {}, contents: {}}
      await initializeCluster(client, newConfig);
    }
    if (!newConfig){
      setLoadingImport(false);
      return;
    }
    updateConfig(newConfig);
    setRegisterUrl(undefined);
    updateActiveUrl(newConfig.baseUrl);
    updateMainCtx({
      action: "add"
    })
  }

  const handleSecretgraphEvent = async (event: any) => {
    setOldConfig(config);
    updateConfig(null);
    setLoadingStart(true);
    try {
      await handleSecretgraphEvent_inner(event);
    } catch(errors) {
      console.error(errors);
      updateConfig(oldConfig);
      setMessage({ severity: "error", message: "error while registration" });
      // in success case unmounted so this would be a noop
      // because state is forgotten
      setLoadingImport(false);
    }
  }

  const handleStart_inner = async () => {
    const providerUrl: string = (document.getElementById("secretgraph-provider") as HTMLInputElement).value;
    const client = createClient(providerUrl);
    const result: any = await client.query(
      {query: serverConfigQuery}
    );
    if (!result){
      return;
    }
    const sconfig = result.data.secretgraph.config;
    const hashAlgos = [];
    for(const algo of sconfig.hashAlgorithms){
      const mappedName = mapHashNames[algo];
      if (mappedName){
        hashAlgos.push(mappedName.operationName);
      }
    }
    if (!hashAlgos){
      setMessage({ severity: "warning", message: "unsupported hash algorithm" });
      return
    }
    if (sconfig.registerUrl === true) {
      const newConfig: ConfigInterface = {
        certificates: {},
        tokens: {},
        hosts: {},
        baseUrl: (new URL(providerUrl, window.location.href)).href,
        configHashes: [],
        configCluster: ""
      };
      newConfig.hosts[newConfig.baseUrl] = {hashAlgorithms: hashAlgos, clusters: {}, contents: {}}
      const client = createClient(newConfig.baseUrl);
      await initializeCluster(client, newConfig);
      // TODO: handle exceptions and try with login
      setRegisterUrl(undefined);
      saveConfig(newConfig);
      updateConfig(newConfig);
      updateActiveUrl(newConfig.baseUrl);
      updateMainCtx({
        action: "add"
      });
    } else if (typeof(sconfig.registerUrl) === "string") {
      setRegisterUrl(sconfig.registerUrl);
    } else {
      setMessage({ severity: "warning", message: "cannot register here" });
    }
  }
  const handleStart = async () => {
    setOldConfig(config);
    updateConfig(null);
    setLoadingStart(true);
    try {
      await handleStart_inner();
    } catch(errors) {
      console.error(errors);
      updateConfig(oldConfig);
      setMessage({ severity: "error", message: "error while registration" });
      // in success case unmounted so this would be a noop
      // because state is forgotten
      setLoadingStart(false);
    }
  }

  const handleImport_inner = async () => {
    const decryptingPw = (document.getElementById("secretgraph-decrypting") as HTMLInputElement).value;
    const importFiles: FileList | null = (document.getElementById("secretgraph-import-file") as HTMLInputElement).files;
    const importUrl: string = (document.getElementById("secretgraph-import-url") as HTMLInputElement).value;
    if(!importFiles && !importUrl){
      return;
    }
    const newConfig = await loadConfig(hasFile && importFiles ? importFiles[0] : importUrl, decryptingPw ? [decryptingPw] : undefined);
    if (!newConfig){
      /**if (importUrl && !importFiles){

        return;
      } else {*/
      setMessage({ severity: "error", message: "Configuration is invalid" });
      setLoadingImport(false);
      return;
    }
    const newClient = createClient(newConfig.baseUrl);
    if(!await checkConfigObject(newClient, newConfig)){
      setMessage({ severity: "error", message: "Configuration is invalid (server-side)" });
      setLoadingImport(false);
      return;
    }
    saveConfig(newConfig);

    // const env = createEnvironment(newConfig.baseUrl);
    updateConfig(newConfig);
    updateActiveUrl(newConfig.baseUrl);
    updateMainCtx({
      action: "add",
    });
  }
  const handleImport = async () => {
    setOldConfig(config);
    updateConfig(null);
    setLoadingImport(true);
    try {
      await handleImport_inner();
    } catch (errors) {
      console.error(errors);
      updateConfig(oldConfig);
      setMessage({ severity: "error", message: "error while import" });
      // in success case unmounted so this would be a noop
      // because state is forgotten
      setLoadingImport(false);
    }
  }

  React.useEffect(() => {
    document.addEventListener("secretgraph" as const, handleSecretgraphEvent);
    return () =>
      document.removeEventListener("secretgraph" as const, handleSecretgraphEvent)
  })

  return (
    <React.Fragment>
      <Dialog open={registerUrl ? true : false} onClose={() => loadingStart && setRegisterUrl(undefined)} aria-labelledby="register-dialog-title">
        <DialogTitle id="register-dialog-title">Register</DialogTitle>
        <DialogContent>
          <iframe src={registerUrl}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterUrl(undefined)} color="secondary" disabled={loadingStart}>
            Close
          </Button>
          <Button onClick={handleStart} color="primary" disabled={loadingStart || loadingImport}>
            Retry
            {(loadingStart) && <CircularProgress size={24} className={classes.buttonProgress} />}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={loginUrl ? true : false} onClose={() => loadingImport && setLoginUrl(undefined)} aria-labelledby="login-dialog-title">
        <DialogTitle id="login-dialog-title">Login</DialogTitle>
        <DialogContent>
          <iframe src={loginUrl}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoginUrl(undefined)} color="secondary" disabled={loadingImport}>
            Close
          </Button>
          <Button onClick={handleImport} color="primary" disabled={loadingStart || loadingImport}>
            Retry
            {loadingImport && <CircularProgress size={24} className={classes.buttonProgress} />}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={message ? true : false}
        autoHideDuration={12000}
        onClose={() => setMessage(undefined)}
      >
        <Alert onClose={() => setMessage(undefined)} severity={message ? message.severity : undefined}>
          {message ? message.message : undefined}
        </Alert>
      </Snackbar>
      <Card>
        <CardContent>
          <Card raised={(mainCtx.action === "start")}>
            <CardContent>
              <Typography className={classes.title} color="textPrimary" gutterBottom paragraph>
                {startHelp}
              </Typography>
              <TextField
                disabled={loadingStart || loadingImport}
                fullWidth
                variant="outlined"
                defaultValue={defaultPath}
                label="Provider"
                id="secretgraph-provider"
              />
            </CardContent>
            <CardActions>
              <Button size="small" variant="contained" color="secondary"
                onClick={handleStart}
                disabled={loadingStart || loadingImport}
              >
                {startLabel}
                {loadingStart && <CircularProgress size={24} className={classes.buttonProgress} />}
              </Button>
            </CardActions>
          </Card>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography className={classes.title} color="textPrimary" gutterBottom paragraph>
            {importHelp}
          </Typography>
          <div className={classes.import_Wrapper}>
            <FormControl className={classes.import_Item}>
              <input
                disabled={loadingStart || loadingImport}
                className={classes.hidden}
                type="file"
                id="secretgraph-import-file"
                aria-describedby="secretgraph-import-file-help"
                onChange={
                  async () => {
                    (document.getElementById("secretgraph-import-url") as HTMLInputElement).value="";
                    const importFiles: FileList | null = (document.getElementById("secretgraph-import-file") as HTMLInputElement).files;
                    try {
                      if(importFiles){
                        setNeedsPw(!!(JSON.parse(await importFiles[0].text()).prekeys));
                        setHasFile(true);
                      } else {
                        throw Error();
                      }
                    } catch(exc){
                      setHasFile(false);
                    }
                  }
                }
              />
              <label htmlFor="secretgraph-import-file">
                <Button
                  variant="contained"
                  component="span"
                  color="primary"
                  disabled={loadingStart || loadingImport }
                  endIcon={
                    hasFile ? <CheckIcon/> : <SystemUpdateAltIcon/>
                  }
                >
                  Import from File
                </Button>
              </label>
              <FormHelperText id="secretgraph-import-file-help">{importFileLabel}</FormHelperText>
            </FormControl>
            <div className={classes.import_Item}>or</div>
            <FormControl className={classes.import_Url}>
              <TextField
                disabled={loadingStart || loadingImport} onChange={
                  (event) => {
                    setHasFile(event.target.value ? false : true);
                    setNeedsPw(true);
                  }
                }
                fullWidth={true}
                variant="outlined"
                size="small"
                placeholder="Import from url"
                id="secretgraph-import-url"
              />
              <FormHelperText id="secretgraph-import-url-help">Import from url</FormHelperText>
            </FormControl>
          </div>
          <FormControl className={needsPw ? null : classes.hidden}>
            <TextField
              variant="outlined"
              disabled={loadingStart || loadingImport} onChange={
                (event) => {
                  setHasPw(event.target.value ? true : false);
                }
              }
              label={decryptingPasswordLabel}
              id="secretgraph-decrypting"
              inputProps={{ 'aria-describedby': "secretgraph-decrypting-help" }}
              type="password"
            />
            <FormHelperText id="secretgraph-decrypting-help">{decryptingPasswordHelp}</FormHelperText>
          </FormControl>
        </CardContent>
        <CardActions>
          <Button size="small" variant="contained" color="primary"
            disabled={loadingStart || loadingImport || !checkInputs(needsPw, hasPw)}
            onClick={handleImport}>
              {importStartLabel}
              {(loadingImport) && <CircularProgress size={24} className={classes.buttonProgress} />}
          </Button>
        </CardActions>
      </Card>
    </React.Fragment>
  );
}

export default SettingsImporter;
