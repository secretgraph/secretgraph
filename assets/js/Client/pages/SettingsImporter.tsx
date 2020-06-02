
import * as React from "react";
import { Theme } from "@material-ui/core/styles";

import TextField from '@material-ui/core/TextField';
import Card from '@material-ui/core/Card';
import CardActions from '@material-ui/core/CardActions';
import CardContent from '@material-ui/core/CardContent';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import Input from '@material-ui/core/Input';
import { themeComponent } from "../theme";
import { startHelp } from "../messages";
import { elements } from '../components/elements';

type Props = {
  classes: any,
  theme: Theme,
  mainContext: any,
  setMainContext: any
};

function SettingsImporter(props: Props) {
  const { classes, theme, mainContext, setMainContext } = props;
  const TextRef: React.RefObject<any> = React.createRef()

  return (
    <React.Fragment>
      <Card className={mainContext.action === "start" ? null : classes.hidden}>
        <CardContent>
          <Typography className={classes.title} color="textSecondary" gutterBottom>
            {startHelp}
          </Typography>
          <TextField variant="outlined" label="Provider" id="secretgraph-provider" ref={TextRef} />
        </CardContent>
        <CardActions>
          <Button size="small">Start</Button>
        </CardActions>
      </Card>
      <div>
      <Input defaultValue="Hello world" inputProps={{ 'aria-label': 'description' }} />

      </div>
    </React.Fragment>
  );
}

export default themeComponent(SettingsImporter);
