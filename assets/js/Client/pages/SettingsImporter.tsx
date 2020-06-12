
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import TextField from '@material-ui/core/TextField';
import FormControl from '@material-ui/core/FormControl';
import FormHelperText from '@material-ui/core/FormHelperText';
import InputLabel from '@material-ui/core/InputLabel';
import Snackbar from '@material-ui/core/Snackbar';
import MuiAlert from '@material-ui/lab/Alert';
import Dialog from '@material-ui/core/Dialog';
import DialogTitle from '@material-ui/core/DialogTitle';
import DialogContent from '@material-ui/core/DialogContent';
import Card from '@material-ui/core/Card';
import CardActions from '@material-ui/core/CardActions';
import CardContent from '@material-ui/core/CardContent';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import Input from '@material-ui/core/Input';


import { Environment, Network, RecordSource, Store, fetchQuery } from "relay-runtime";

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
import { ConfigInterface, SecretgraphEventInterface, SnackMessageInterface } from '../interfaces';
import { loadConfig } from "../utils/config";
import { createEnvironment, initializeCluster } from "../utils/graphql";
import { utf8ToBinary } from "../utils/misc"
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
  const [message, setMessage] = React.useState(undefined) as [SnackMessageInterface | undefined, any];
  const mainElement = document.getElementById("content-main");
  const defaultPath: string | undefined = mainElement ? mainElement.dataset.serverPath : undefined;

  const handleSecretgraphEvent = async (event: any) => {
    const providerUrl = (document.getElementById("secretgraph-provider") as HTMLInputElement).value;
    const encryptingPw = (document.getElementById("secretgraph-encrypting") as HTMLInputElement).value;
    let newConfig: ConfigInterface | null = null;
    let env: Environment | null = null;
    if (event.pingCreate){
      newConfig = {
        certificates: {},
        tokens: {},
        clusters: {},
        baseUrl: providerUrl
      };
      env = createEnvironment(newConfig.baseUrl);
      let b64key: string | null = null
      if (encryptingPw) {
        b64key = btoa(utf8ToBinary(encryptingPw));
      }
      await initializeCluster(env, newConfig, b64key);
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

  const handleStart = async (event: any) => {
    const providerUrl = (document.getElementById("secretgraph-provider") as HTMLInputElement).value;
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
        baseUrl: event.configUrl ? event.configUrl : providerUrl
      };
      const env = createEnvironment(newConfig.baseUrl);
      let b64key: string | null = null
      if (encryptingPw) {
        b64key = btoa(utf8ToBinary(encryptingPw));
      }
      await initializeCluster(env, newConfig, b64key);
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

  const handleImport = async (event: any) => {
    const decryptingPw = (document.getElementById("secretgraph-decrypting") as HTMLInputElement).value;
    const importFiles: FileList | null = (document.getElementById("secretgraph-import-file") as HTMLInputElement).files;
    if(!importFiles){
      return;
    }
    //TODO: support encrypted config files
    let binary: string | undefined = undefined;
    if (decryptingPw) {
      binary = utf8ToBinary(decryptingPw);
    }
    const newConfig = await loadConfig(importFiles[0], binary);
    if (!newConfig){
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

  React.useEffect(() => {
    document.addEventListener("secretgraph" as const, handleSecretgraphEvent);
    return () => document.removeEventListener("secretgraph" as const, handleSecretgraphEvent);
  })

  return (
    <React.Fragment>
      <Dialog open={registerUrl ? true : false} onClose={() => setRegisterUrl(undefined)} aria-labelledby="register-login-dialog-title">
        <DialogTitle id="register-login-dialog-title">Subscribe</DialogTitle>
        <DialogContent>
          <iframe src={registerUrl}
          />
        </DialogContent>
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
              >{startLabel}</Button>
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
              disableUnderline={true}
              type="file"
              id="secretgraph-import-file"
              aria-describedby="secretgraph-import-file-help"
            />
            <FormHelperText id="secretgraph-import-file-help">{importFileLabel}</FormHelperText>
          </FormControl>
          <FormControl>
            <TextField
              variant="outlined"
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
            onClick={handleImport}>{importStartLabel}</Button>
        </CardActions>
      </Card>
    </React.Fragment>
  );
}

export default themeComponent(SettingsImporter);
