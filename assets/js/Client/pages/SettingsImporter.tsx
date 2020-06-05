
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
import { themeComponent } from "../theme";
import { startHelp, startLabel, importStartLabel, importFileLabel, importHelp } from "../messages";
import { ConfigInterface, SecretgraphEventInterface } from '../interfaces';
import { loadConfig } from "../utils/config";

type Props = {
  classes: any,
  theme: Theme,
  mainContext: any,
  setMainContext: any,
  config: ConfigInterface,
  setConfig: any
};

function SettingsImporter(props: Props) {
  const { classes, theme, mainContext, setMainContext } = props;
  const [open, setOpen] = React.useState(false);
  const TextRef: React.RefObject<any> = React.createRef();

  const handleSecretgraphEvent = (event: SecretgraphEventInterface) => {
    if (event.created){
      if (event.configUrl){
        const config = loadConfig(
          new Request(
            event.configUrl,
            {
              method: "GET",
              mode: "cors",
              credentials: 'include',
            }
          )
        )
      } else {
        const config = null;
      }
    } else {
      const config = null;
    }
    setOpen(false);
    setMainContext({
      ...mainContext,
      action: "add",
      environment: createEnvironment(config.baseUrl)
    })
  }

  let dialog = null;
  if (open){
    dialog = (
      <Dialog open={true} onClose={() => setOpen(false)} aria-labelledby="register-login-dialog-title">
        <DialogTitle id="register-login-dialog-title">Subscribe</DialogTitle>
        <DialogContent>
          <iframe src={TextRef.current?.value}
          />
        </DialogContent>
      </Dialog>
    );

    React.useEffect(() => {
      document.addEventListener("secretgraph", handleSecretgraphEvent);
      return () => document.removeEventListener("secretgraph", handleSecretgraphEvent);
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
          <TextField variant="outlined" label="Provider" id="secretgraph-provider" ref={TextRef} />
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
