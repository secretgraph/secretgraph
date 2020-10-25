
import * as React from "react";
import Toolbar from "@material-ui/core/Toolbar";
import Tooltip from '@material-ui/core/Tooltip';
import IconButton from "@material-ui/core/IconButton";
import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import ShareIcon from '@material-ui/icons/Share';
import NativeSelect from '@material-ui/core/NativeSelect';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogTitle from '@material-ui/core/DialogTitle';
import Button from '@material-ui/core/Button';
import DialogContent from '@material-ui/core/DialogContent';
import Link from '@material-ui/core/Link';
import HelpOutlineOutlinedIcon from '@material-ui/icons/HelpOutlineOutlined';
import { elements } from './elements';
import { contentStates } from '../constants';
import { MainContext } from '../contexts';
import { useStylesAndTheme } from '../theme';

type Props = {
};

function createOptionsIterator(mapObject: Map<string, any>) {
  return {
    *[Symbol.iterator]() {
      for(const [key, value] of mapObject){
        yield (
          <option value={key} key={key}>{value.label}</option>
        );
      }
    }
  }
}


function ActionBar(props: Props) {
  const {classes, theme} = useStylesAndTheme();
  const [shareOpen, setShareOpen] = React.useState(false);
  const [actionAddOpen, setActionAddOpen] = React.useState(false);
  const [actionAddWeakOpen, setActionAddWeakOpen] = React.useState(false);
  const {mainCtx, setMainCtx} = React.useContext(MainContext);

  const addAction = () => {
    if (!actionAddOpen){
      setActionAddOpen(true);
      return;
    }
  }


  const blurDisables = () => {
    if (!actionAddWeakOpen){
      setActionAddOpen(false);
    }
  }
  return (
    <nav className={classes.actionToolBarOuter}
      onMouseLeave={() => setActionAddWeakOpen(false)}
    >
      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} aria-labelledby="share-dialog-title">
        <DialogTitle id="share-dialog-title">Share</DialogTitle>
        <DialogContent>
          <Link href={"" + mainCtx.shareUrl} onClick={(event:any) => {
            if (navigator.clipboard){
              navigator.clipboard.writeText("" + mainCtx.shareUrl)
              event.preventDefault()
              console.log("url copied");
              return false
            } else {
              console.log("clipboard not supported");
            }
            }}
          >
            {mainCtx.shareUrl}
          </Link>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)} color="secondary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <div style={{flexGrow: 1}} />
      <Toolbar className={classes.actionToolBarInner}>
        <Tooltip title="Select state of content" arrow>
          <NativeSelect
            className={classes.contentStateSelect}
            onChange={(event: any) => setMainCtx({
              ...mainCtx,
              state: event.target.value
            })}
            value={mainCtx.state || undefined}
            children={
              createOptionsIterator(contentStates)
            }
          />
        </Tooltip>
        <Tooltip title="Edit" arrow>
          <IconButton
            className={mainCtx.item  && mainCtx.action === "view" ? classes.actionToolBarButton : classes.hidden}
            aria-label="edit"
            onClick={() => setMainCtx({
              ...mainCtx,
              action: "edit"
            })}
          >
            <EditIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add Element" arrow>
          <NativeSelect
            className={(actionAddWeakOpen || actionAddOpen || mainCtx.action === "add") ? classes.newItemSelect : classes.hidden}
            onChange={(event: any) => setMainCtx({
              ...mainCtx,
              action: "add",
              item: null,
              shareUrl: null,
              type: event.target.value
            })}
            value={mainCtx.type || undefined}
            children={
              createOptionsIterator(elements)
            }
            onBlur={blurDisables}
          />
        </Tooltip>
        <Tooltip title="Add" arrow>
          <IconButton
            className={(actionAddWeakOpen || actionAddOpen || mainCtx.action === "add") ? classes.hidden : classes.actionToolBarButton}
            aria-label="add"
            onClick={addAction}
            onMouseEnter={() => setActionAddWeakOpen(true)}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Share" arrow>
          <IconButton
              className={classes.actionToolBarButton}
              aria-label="share"
              onClick={() => setShareOpen(false)}
            >
            <ShareIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Help" arrow>
          <IconButton
              className={classes.actionToolBarButton}
              aria-label="help"
            >
            <HelpOutlineOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </nav>
  );
}

export default ActionBar;
