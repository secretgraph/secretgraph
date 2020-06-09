
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import TextField from '@material-ui/core/TextField';
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
import { startHelp, startLabel, importStartLabel, importFileLabel, importHelp } from "../messages";
import { ConfigInterface, SecretgraphEventInterface } from '../interfaces';
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

function SettingsImporter(props: Props) {
  const { classes, theme, mainContext, setMainContext, config, setConfig } = props;
  const [registerUrl, setRegisterUrl] = React.useState(undefined);
  const ProviderUrlRef: React.RefObject<any> = React.createRef();
  const ImportFileRef: React.RefObject<any> = React.createRef();
  const EncryptingRef: React.RefObject<any> = React.createRef();
  const DecryptingRef: React.RefObject<any> = React.createRef();
  const mainElement = document.getElementById("content-main");
  const defaultPath: string | undefined = mainElement ? mainElement.dataset.serverPath : undefined;

  const handleSecretgraphEvent = async (event: any) => {
    let newConfig: ConfigInterface | null = null;
    let env: Environment | null = null;
    if (event.created){
      newConfig = {
        certificates: {},
        tokens: {},
        clusters: {},
        baseUrl: event.configUrl ? event.configUrl : ProviderUrlRef.current.value
      };
      env = createEnvironment(newConfig.baseUrl);
      let b64key: string | null = null
      if (EncryptingRef.current.value) {
        b64key = btoa(utf8ToBinary(EncryptingRef.current.value));
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
    const env = createEnvironment(ProviderUrlRef.current.value);
    let clusterId: string;
    const sconfig: any = await fetchQuery(
      env, serverConfigQuery, {}
    );
    if (sconfig.registerUrl === true) {
      let newConfig: ConfigInterface = {
        certificates: {},
        tokens: {},
        clusters: {},
        baseUrl: event.configUrl ? event.configUrl : ProviderUrlRef.current.value
      };
      const env = createEnvironment(newConfig.baseUrl);
      let b64key: string | null = null
      if (EncryptingRef.current.value) {
        b64key = btoa(utf8ToBinary(EncryptingRef.current.value));
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
    }
  }

  const handleImport = async (event: any) => {
    //TODO: support encrypted config files
    let binary: string | null = null
    if (DecryptingRef.current.value) {
      binary = utf8ToBinary(DecryptingRef.current.value);
    }
    const newConfig = loadConfig(ImportFileRef.current.files[0])
    const env = createEnvironment(ProviderUrlRef.current.value);
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
      <Card className={mainContext.action === "start" ? null : classes.hidden}>
        <CardContent>
          <Typography className={classes.title} color="textSecondary" gutterBottom>
            {startHelp}
          </Typography>
          <div>
          <TextField variant="outlined" label="Password for encrypting config" id="secretgraph-encrypting" ref={EncryptingRef} inputProps={{ input: "password" }} />
          </div>
          <div>
          <TextField variant="outlined" defaultValue={defaultPath} label="Provider" id="secretgraph-provider" ref={ProviderUrlRef} />
          </div>
        </CardContent>
        <CardActions>
          <Button size="small" variant="outlined"
            onClick={handleStart}
          >{startLabel}</Button>
        </CardActions>
      </Card>
      <Card>
        <CardContent>
          <Typography className={classes.title} color="textSecondary" gutterBottom>
            {importHelp}
          </Typography>
          <TextField defaultValue={importFileLabel} inputProps={{ 'aria-label': importFileLabel, "input": "file" }}  id="secretgraph-import-file" ref={ImportFileRef} />
          <TextField variant="outlined" label="Password for decrypting config" id="secretgraph-decrypting" ref={DecryptingRef} inputProps={{ input: "password" }} />
        </CardContent>
        <CardActions>
          <Button size="small" variant="outlined"
            onClick={handleImport}>{importStartLabel}</Button>
        </CardActions>
      </Card>
    </React.Fragment>
  );
}

export default themeComponent(SettingsImporter);
