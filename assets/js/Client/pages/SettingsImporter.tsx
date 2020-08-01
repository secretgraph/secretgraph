
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

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

import { fetchQuery } from "relay-runtime";

import { themeComponent } from "../theme";
import {
  startHelp,
  startLabel,
  importStartLabel,
  importFileLabel,
  importHelp,
  encryptingPasswordLabel,
  encryptingPasswordHelp,
  decryptingPasswordLabel,
  decryptingPasswordHelp
} from "../messages";
import { ConfigInterface, SnackMessageInterface } from '../interfaces';
import { loadConfig } from "../utils/config";
import { createEnvironment, initializeCluster } from "../utils/graphql";
import { utf8ToBinary, utf8encoder } from "../utils/misc"
import { serverConfigQuery } from "../queries/server"
import { mapHashNames } from "../constants"

type Props = {
  classes: any,
  theme: Theme,
  mainContext: any,
  setMainContext: any,
  config: ConfigInterface,
  setConfig: any
};

function Alert(props: any) {
  return <MuiAlert elevation={6} variant="filled" {...props} />;
}

function hasImportInput() {
  return (
    !(document.getElementById("secretgraph-import-url") as HTMLInputElement)?.value &&
    !(document.getElementById("secretgraph-import-file") as HTMLInputElement)?.files
  )
}

function SettingsImporter(props: Props) {
  const { classes, theme, mainContext, setMainContext, config, setConfig } = props;
  const [registerUrl, setRegisterUrl] = React.useState(undefined);
  const [loadingStart, setLoadingStart] = React.useState(false);
  const [loadingImport, setLoadingImport] = React.useState(false);
  const [oldConfig, setOldConfig] = React.useState(null) as [ConfigInterface | null, any];
  const [loginUrl, setLoginUrl] = React.useState(undefined);
  const [message, setMessage] = React.useState(undefined) as [SnackMessageInterface | undefined, any];
  const [hasFile, setHasFile] = React.useState(false);
  const mainElement = document.getElementById("content-main");
  const defaultPath: string | undefined = mainElement ? mainElement.dataset.graphqlPath : undefined;

  const handleSecretgraphEvent_inner = async (event: any) => {
    const providerUrl = (document.getElementById("secretgraph-provider") as HTMLInputElement).value;
    const encryptingPw = (document.getElementById("secretgraph-encrypting") as HTMLInputElement).value;
    let newConfig: ConfigInterface | null = null;
    const env = createEnvironment(providerUrl);
    if (!env) {
      return;
    }
    const result: any = await fetchQuery(
      env, serverConfigQuery, {}
    );
    if (!result){
      return;
    }
    const sconfig = result.secretgraphConfig;
    const hashAlgo = mapHashNames[sconfig.hashAlgorithms[0]];
    if (!hashAlgo){
      setMessage({ severity: "warning", message: "unsupported hash algorithm" });
      return
    }
    if (event.pingCreate){
      newConfig = {
        certificates: {},
        tokens: {},
        clusters: {},
        baseUrl: providerUrl,
        configHashes: [],
        configCluster: "",
        hashAlgorithm: hashAlgo
      };
      let b64key: string | null = null
      if (encryptingPw) {
        b64key = btoa(utf8ToBinary(encryptingPw));
      } else {
        const key = crypto.getRandomValues(new Uint8Array(32));
        b64key = btoa(String.fromCharCode(... key));
      }
      await initializeCluster(env, newConfig, b64key, sconfig.PBKDF2Iterations);
    }
    if (!newConfig){
      return;
    }

    setConfig(newConfig);
    setRegisterUrl(undefined);
    setMainContext({
      ...mainContext,
      action: "add"
    })
  }

  const handleSecretgraphEvent = async (event: any) => {
    setOldConfig(config);
    setConfig(null);
    setLoadingStart(true);
    try {
      return await handleSecretgraphEvent_inner(event);
    } catch(errors) {
      setConfig(oldConfig);
      console.error(errors);
      setMessage({ severity: "error", message: "error while registration" });
    } finally{
      setLoadingStart(false);
    }
  }

  const handleStart_inner = async () => {
    const providerUrl: string = (document.getElementById("secretgraph-provider") as HTMLInputElement).value;
    const encryptingPw = (document.getElementById("secretgraph-encrypting") as HTMLInputElement).value;
    const env = createEnvironment(providerUrl);
    const result: any = await fetchQuery(
      env, serverConfigQuery, {}
    );
    if (!result){
      return;
    }
    const sconfig = result.secretgraphConfig;
    const hashAlgo = mapHashNames[sconfig.hashAlgorithms[0]];
    if (!hashAlgo){
      setMessage({ severity: "warning", message: "unsupported hash algorithm" });
      return
    }
    if (sconfig.registerUrl === true) {
      let newConfig: ConfigInterface = {
        certificates: {},
        tokens: {},
        clusters: {},
        baseUrl: providerUrl,
        configHashes: [],
        configCluster: "",
        hashAlgorithm: hashAlgo
      };
      const env = createEnvironment(newConfig.baseUrl);
      let b64key: string;
      if (encryptingPw) {
        b64key = btoa(utf8ToBinary(encryptingPw));
      } else {
        const key = crypto.getRandomValues(new Uint8Array(32));
        b64key = btoa(String.fromCharCode(... key));
      }
      await initializeCluster(
        env, newConfig, b64key, sconfig.PBKDF2Iterations[0]
      );
      // TODO: handle exceptions and try with login
      setRegisterUrl(undefined);
      setConfig(newConfig);
      setMainContext({
        ...mainContext,
        action: "add",
        activeUrl: newConfig.baseUrl
      });
    } else if (typeof(sconfig.registerUrl) === "string") {
      setRegisterUrl(sconfig.registerUrl);
    } else {
      setMessage({ severity: "warning", message: "cannot register here" });
    }
  }
  const handleStart = async () => {
    setOldConfig(config);
    setConfig(null);
    setLoadingStart(true);
    try {
      return await handleStart_inner();
    } catch(errors) {
      setConfig(oldConfig);
      console.error(errors);
      setMessage({ severity: "error", message: "error while registration" });
    } finally {
      setLoadingStart(false)
    }
  }

  const handleImport_inner = async () => {
    const decryptingPw = (document.getElementById("secretgraph-decrypting") as HTMLInputElement).value;
    const importFiles: FileList | null = (document.getElementById("secretgraph-import-file") as HTMLInputElement).files;
    const importUrl: string = (document.getElementById("secretgraph-import-url") as HTMLInputElement).value;
    if(!importFiles && !importUrl){
      return;
    }
    let binary: string | undefined = undefined;
    if (decryptingPw) {
      binary = utf8ToBinary(decryptingPw);
    }
    const newConfig = await loadConfig(hasFile && importFiles ? importFiles[0] : importUrl, binary);
    if (!newConfig){
      /**if (importUrl && !importFiles){

        return;
      } else {*/
      setMessage({ severity: "error", message: "Configuration is invalid" });
      return;
    }
    // const env = createEnvironment(newConfig.baseUrl);
    setConfig(newConfig);
    setMainContext({
      ...mainContext,
      action: "add",
      activeUrl: newConfig.baseUrl
    });
  }
  const handleImport = async () => {
    setOldConfig(config);
    setConfig(null);
    setLoadingImport(true);
    try {
      return await handleImport_inner();
    } catch (errors) {
      setConfig(oldConfig);
      console.error(errors);
      setMessage({ severity: "error", message: "error while import" });
    } finally {
      setLoadingImport(false)
    }
  }

  React.useEffect(() => {
    document.addEventListener("secretgraph" as const, handleSecretgraphEvent);
    return () => document.removeEventListener("secretgraph" as const, handleSecretgraphEvent);
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
          <Card raised={true} className={mainContext.action === "start" ? null : classes.hidden}>
            <CardContent>
              <Typography className={classes.title} color="textPrimary" gutterBottom paragraph>
                {startHelp}
              </Typography>
              <FormControl>
                <TextField
                  disabled={loadingStart || loadingImport}
                  fullWidth={true}
                  variant="outlined"
                  label={encryptingPasswordLabel}
                  id="secretgraph-encrypting"
                  inputProps={{ 'aria-describedby': "secretgraph-encrypting-help", autoComplete: "new-password" }}
                  type="password"
                />
                <FormHelperText id="secretgraph-encrypting-help">{encryptingPasswordHelp}</FormHelperText>
              </FormControl>
              <TextField
                disabled={loadingStart || loadingImport}
                fullWidth={true}
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
          <FormControl>
            <input
              disabled={loadingStart || loadingImport}
              className={classes.hidden}
              type="file"
              id="secretgraph-import-file"
              aria-describedby="secretgraph-import-file-help"
              onChange={
                () => {
                  (document.getElementById("secretgraph-import-url") as HTMLInputElement).value="";
                  setHasFile(true);
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
          <TextField
            disabled={loadingStart || loadingImport} onChange={
              (event) => {
                setHasFile(event.target.value ? false : true);
              }
            }
            fullWidth={true}
            variant="outlined"
            label="Import from url"
            id="secretgraph-import-url"
          />
          <FormControl>
            <TextField
              variant="outlined"
              disabled={loadingStart || loadingImport}
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
            disabled={loadingStart || loadingImport || hasImportInput()}
            onClick={handleImport}>
              {importStartLabel}
              {(loadingImport) && <CircularProgress size={24} className={classes.buttonProgress} />}
          </Button>
        </CardActions>
      </Card>
    </React.Fragment>
  );
}

export default themeComponent(SettingsImporter);
