
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import TextField from '@material-ui/core/TextField';
import FormControl from '@material-ui/core/FormControl';
import FormHelperText from '@material-ui/core/FormHelperText';
import CircularProgress from '@material-ui/core/CircularProgress';
import InputLabel from '@material-ui/core/InputLabel';
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
import Input from '@material-ui/core/Input';


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

function SettingsImporter(props: Props) {
  const { classes, theme, mainContext, setMainContext, config, setConfig } = props;
  const [registerUrl, setRegisterUrl] = React.useState(undefined);
  const [loadingStart, setLoadingStart] = React.useState(false);
  const [loadingImport, setLoadingImport] = React.useState(false);
  const [loginUrl, setLoginUrl] = React.useState(undefined);
  const [message, setMessage] = React.useState(undefined) as [SnackMessageInterface | undefined, any];
  const mainElement = document.getElementById("content-main");
  const defaultPath: string | undefined = mainElement ? mainElement.dataset.serverPath : undefined;

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
    if (event.pingCreate){
      newConfig = {
        certificates: {},
        tokens: {},
        clusters: {},
        baseUrl: providerUrl,
        configHashes: [],
        configCluster: ""
      };
      let b64key: string | null = null
      if (encryptingPw) {
        b64key = btoa(utf8ToBinary(encryptingPw));
      } else {
        const key = crypto.getRandomValues(new Uint8Array(32));
        b64key = btoa(String.fromCharCode(... key));
      }
      await initializeCluster(env, newConfig, b64key, "SHA-512", sconfig.PBKDF2Iterations);
    }
    if (!newConfig){
      return;
    }

    setConfig(newConfig);
    setRegisterUrl(undefined);
    setMainContext({
      ...mainContext,
      action: "add",
      environment: env
    })
  }

  const handleSecretgraphEvent = (event: any) => {
    const oldConfig = config;
    setConfig(null);
    setLoadingStart(true);
    return handleSecretgraphEvent_inner(event).catch(
      (errors: any) => {
        setConfig(oldConfig);
        console.error(errors);
        setMessage({ severity: "error", message: "error while registration" });
      }
    ).finally(
      () => setLoadingStart(false)
    )
  }

  const handleStart_inner = async () => {
    const providerUrl: string = (document.getElementById("secretgraph-provider") as HTMLInputElement).value;
    const encryptingPw = (document.getElementById("secretgraph-encrypting") as HTMLInputElement).value;
    const env = createEnvironment(providerUrl);
    let clusterId: string;
    const result: any = await fetchQuery(
      env, serverConfigQuery, {}
    );
    if (!result){
      return;
    }
    const sconfig = result.secretgraphConfig;
    if (sconfig.registerUrl === true) {
      let newConfig: ConfigInterface = {
        certificates: {},
        tokens: {},
        clusters: {},
        baseUrl: providerUrl,
        configHashes: [],
        configCluster: ""
      };
      const env = createEnvironment(newConfig.baseUrl);
      let b64key: string;
      if (encryptingPw) {
        b64key = btoa(utf8ToBinary(encryptingPw));
      } else {
        const key = crypto.getRandomValues(new Uint8Array(32));
        b64key = btoa(String.fromCharCode(... key));
      }
      await initializeCluster(env, newConfig, b64key, "SHA-512", sconfig.PBKDF2Iterations[0]);
      // TODO: handle exceptions and try with login
      setRegisterUrl(undefined);
      setConfig(newConfig);
      setMainContext({
        ...mainContext,
        action: "add",
        environment: env
      });
    } else if (typeof(sconfig.registerUrl) === "string") {
      setRegisterUrl(sconfig.registerUrl);
    } else {
      setMessage({ severity: "warning", message: "cannot register here" });
    }
  }
  const handleStart = () => {
    const oldConfig = config;
    setConfig(null);
    setLoadingStart(true);
    return handleStart_inner().catch(
      (errors: any) => {
        setConfig(oldConfig);
        console.error(errors);
        setMessage({ severity: "error", message: "error while registration" });
      }
    ).finally(
      () => setLoadingStart(false)
    )
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
    const newConfig = await loadConfig(importFiles ? importFiles[0] : importUrl, binary);
    if (!newConfig){
      /**if (importUrl && !importFiles){

        return;
      } else {*/
      setMessage({ severity: "error", message: "Configuration is invalid" });
      return;
    }
    const env = createEnvironment(newConfig.baseUrl);
    setConfig(newConfig);
    setMainContext({
      ...mainContext,
      action: "add",
      environment: env
    });
  }
  const handleImport = () => {
    const oldConfig = config;
    setConfig(null);
    setLoadingImport(true);
    return handleImport_inner().catch(
      (errors: any) => {
        setConfig(oldConfig);
        console.error(errors);
        setMessage({ severity: "error", message: "error while import" });
      }
    ).finally(
      () => setLoadingImport(false)
    )
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
              <Button size="small" variant="contained" color="primary"
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
            <Input
              disabled={loadingStart || loadingImport}
              disableUnderline={true}
              type="file"
              id="secretgraph-import-file"
              aria-describedby="secretgraph-import-file-help"
            />
            <FormHelperText id="secretgraph-import-file-help">{importFileLabel}</FormHelperText>
          </FormControl>
          <TextField
            disabled={loadingStart || loadingImport}
            fullWidth={true}
            variant="outlined"
            label="Import from"
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
            disabled={loadingStart || loadingImport}
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
