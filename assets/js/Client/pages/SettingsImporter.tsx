
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
import { createEnvironment } from "../utils/graphql";

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
      let derivedKey = null;
      let nonce = null;
      if (PasswordRef.current.value) {
        nonce = window.crypto.getRandomValues(new Uint8Array(16));
        const keyMaterial = await window.crypto.subtle.importKey(
          "raw" as const,
          new TextEncoder().encode(PasswordRef.current.value),
          { name: "PBKDF2" as const },
          false,
          ["deriveBits" as const, "deriveKey" as const]
        );
        derivedKey = await window.crypto.subtle.deriveBits(
          {
            "name": "PBKDF2",
            salt: nonce,
            "iterations": 100000,
            "hash": "SHA-256"
          },
          keyMaterial,
          104
        );
      }
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
