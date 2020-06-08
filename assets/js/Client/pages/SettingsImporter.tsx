
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
import { utf8ToBase64 } from "../utils/misc"

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
  const [open, setOpen] = React.useState(false);
  const ProviderUrlRef: React.RefObject<any> = React.createRef();
  const PasswordRef: React.RefObject<any> = React.createRef();

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
      if (PasswordRef.current.value) {
        b64key = utf8ToBase64(PasswordRef.current.value);
      }
      const cluster = await initializeCluster(env, newConfig, b64key);
    } else {
      if (event.configUrl){
        newConfig = await loadConfig(
          new Request(
            event.configUrl,
            {
              method: "GET",
              mode: "cors",
              credentials: 'include',
            }
          )
        )
        if (newConfig){
          env = createEnvironment(newConfig.baseUrl);
        }
      }
      /* TODO: implement loader
      if (!newConfig){}*/
    }
    if (!newConfig){
      return;
    }

    setConfig(newConfig);
    setOpen(false);
    setMainContext({
      ...mainContext,
      action: "add",
      environment: env
    })
  }

  let dialog = null;
  if (open){
    dialog = (
      <Dialog open={true} onClose={() => setOpen(false)} aria-labelledby="register-login-dialog-title">
        <DialogTitle id="register-login-dialog-title">Subscribe</DialogTitle>
        <DialogContent>
          <iframe src={ProviderUrlRef.current?.value}
          />
        </DialogContent>
      </Dialog>
    );

    React.useEffect(() => {
      document.addEventListener("secretgraph" as const, handleSecretgraphEvent);
      return () => document.removeEventListener("secretgraph" as const, handleSecretgraphEvent);
    })
  }

  return (
    <React.Fragment>
      {dialog}
      <Card className={mainContext.action === "start" ? null : classes.hidden}>
        <CardContent>
          <Typography className={classes.title} color="textSecondary" gutterBottom>
            {startHelp}
          </Typography>
          <TextField variant="outlined" label="Password for encrypting config" id="secretgraph-encrypting" ref={PasswordRef} inputProps={{ input: "password" }} />
          <TextField variant="outlined" label="Provider" id="secretgraph-provider" ref={ProviderUrlRef} />
        </CardContent>
        <CardActions>
          <Button size="small"
            onClick={() => setOpen(true)}
          >{startLabel}</Button>
        </CardActions>
      </Card>
      <Card>
        <CardContent>
          <Typography className={classes.title} color="textSecondary" gutterBottom>
            {importHelp}
          </Typography>
          <Input defaultValue={importFileLabel} inputProps={{ 'aria-label': importFileLabel }} />
        </CardContent>
        <CardActions>
          <Button size="small">{importStartLabel}</Button>
        </CardActions>
      </Card>
    </React.Fragment>
  );
}

export default themeComponent(SettingsImporter);
