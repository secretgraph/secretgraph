import * as React from "react";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import MenuItem from "@material-ui/core/MenuItem";
import Menu from "@material-ui/core/Menu";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from "@material-ui/icons/Menu";
import AccountCircle from "@material-ui/icons/AccountCircle";
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogTitle from '@material-ui/core/DialogTitle';
import Button from '@material-ui/core/Button';
import DialogContent from '@material-ui/core/DialogContent';
import TextField from '@material-ui/core/TextField';
import FormControl from '@material-ui/core/FormControl';
import FormHelperText from '@material-ui/core/FormHelperText';
import Link from '@material-ui/core/Link';
import { Theme } from "@material-ui/core/styles";
import { fetchQuery } from "relay-runtime";
import { useRelayEnvironment } from 'relay-hooks';
import { themeComponent } from "../theme";
import { exportConfig, exportConfigAsUrl } from "../utils/config";
import { elements } from './elements';
import { serverConfigQuery } from "../queries/server"
import { findConfigQuery } from "../queries/content"
import { MainContextInterface } from '../interfaces';

import {
  encryptingPasswordLabel,
  encryptingPasswordHelp,
} from "../messages";

type Props = {
  openState: any,
  classes: any,
  theme: Theme,
  mainContext: MainContextInterface,
  setMainContext: any,
  config: any,
  setConfig: any
};
const menuRef: React.RefObject<any> = React.createRef();


function HeaderBar(props: Props) {
  const { classes, theme, mainContext, setMainContext, openState, config, setConfig } = props;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportUrl, setExportUrl] = React.useState("");
  const [loadingExport, setLoadingExport] = React.useState(false);
  const environment = useRelayEnvironment();
  let title: string, documenttitle: string;
  switch (mainContext.action){
    case "add":
      let temp = elements.get(mainContext.item as string);
      title = `Add: ${temp ? temp.label : 'unknown'}`;
      documenttitle = `Secretgraph: ${title}`;
      break;
    case "update":
      title = `Update: ${mainContext.item}`;
      documenttitle = `Secretgraph: ${title}`;
      break;
    case "help":
      title = `Help: ${mainContext.item}`;
      documenttitle = `Secretgraph: ${title}`;
      break;
    case "start":
      title = "Secretgraph - Start";
      documenttitle = title;
      break;
    case "import":
      title = "Secretgraph - Import";
      documenttitle = title;
      break;
    default:
      title = mainContext.item as string;
      documenttitle = `Secretgraph: ${title}`;
      break;
  }


  const exportSettingsFile = async () => {
    setLoadingExport(true);
    const encryptingPw = (document.getElementById("secretgraph-export-pw") as HTMLInputElement).value;
    const sconfig: any = await fetchQuery(
      environment, serverConfigQuery, {}
    ).then((data:any) => data.secretgraphConfig).catch(
      () => setLoadingExport(false)
    );
    if (!sconfig){
      setLoadingExport(false);
      return;
    }
    exportConfig(config, encryptingPw, sconfig.PBKDF2Iterations[0], "secretgraph_settings.json");
    setExportOpen(false);
    setLoadingExport(false);
  }

  const exportSettingsUrl = async () => {
    await navigator.clipboard.writeText(exportUrl);
    setExportOpen(false);
  }

  const exportSettingsOpener = async () => {
    setMenuOpen(false);
    setExportOpen(true);
    await exportConfigAsUrl(environment, config);
    //const qr = qrcode(typeNumber, errorCorrectionLevel);
  }


  const openImporter = () => {
    setMenuOpen(false);
    setMainContext({
      ...mainContext,
      action: "import"
    })
  }

  let sidebarButton = null;
  if (!openState.drawerOpen && config){
    sidebarButton = (
      <IconButton
        edge="start"
        className={classes.sidebarButton}
        onClick={() => openState.setDrawerOpen(true)}
        color="inherit"
        aria-label="menu"
      >
        <MenuIcon />
      </IconButton>
    )
  }

  React.useEffect(() => {
    document.title = documenttitle;
  })

  return (
    <AppBar
      position="sticky"
      className={openState.drawerOpen ? classes.appBarShift : classes.appBar}
    >
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} aria-labelledby="export-dialog-title">
        <DialogTitle id="export-dialog-title">Export</DialogTitle>
        <DialogContent>
          <FormControl>
            <TextField
              disabled={loadingExport}
              fullWidth={true}
              variant="outlined"
              label={encryptingPasswordLabel}
              id="secretgraph-export-pw"
              inputProps={{ 'aria-describedby': "secretgraph-export-pw-help", autoComplete: "new-password" }}
              type="password"
            />
            <FormHelperText id="secretgraph-export-pw-help">{encryptingPasswordHelp}</FormHelperText>
          </FormControl>
          <Link href={exportUrl} onClick={exportSettingsUrl}>
            {exportUrl}
          </Link>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} color="secondary" disabled={loadingExport}>
            Close
          </Button>
          <Button onClick={exportSettingsUrl} color="primary" disabled={loadingExport}>
            Export as url
          </Button>
          <Button onClick={exportSettingsFile} color="primary" disabled={loadingExport}>
            Export as file
          </Button>
        </DialogActions>
      </Dialog>
      <Toolbar className={classes.appBarToolBar}>
        {sidebarButton}
        <Typography variant="h6" className={classes.appBarTitle}>
          {title}
        </Typography>
        <IconButton
          edge="start"
          className={classes.userButton}
          color="inherit"
          aria-label="user"
          ref={menuRef}
          onClick={() => setMenuOpen(true)}
        >
          <AccountCircle />
        </IconButton>
        <Menu
          anchorEl={menuRef.current}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          keepMounted
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        >
          <MenuItem className={!config ? classes.hidden : null} onClick={() => setMenuOpen(false)}>Update Settings</MenuItem>
          <MenuItem className={!config ? classes.hidden : null} onClick={openImporter}>Load Settings</MenuItem>
          <MenuItem className={!config ? classes.hidden : null} onClick={exportSettingsOpener}>Export Settings</MenuItem>
          <MenuItem onClick={() => setMenuOpen(false)}>Help</MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}


export default themeComponent(HeaderBar);
