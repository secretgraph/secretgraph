
import * as React from "react";
import { themeComponent } from "../theme";
import Toolbar from "@material-ui/core/Toolbar";
import Tooltip from '@material-ui/core/Tooltip';
import { Theme } from "@material-ui/core/styles";
import IconButton from "@material-ui/core/IconButton";
import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import NativeSelect from '@material-ui/core/NativeSelect';
import HelpOutlineOutlinedIcon from '@material-ui/icons/HelpOutlineOutlined';
import { elements } from './elements';
import { contentStates } from '../constants';
import { MainContext } from '../contexts';


type Props = {
  classes: any,
  theme: Theme,
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
  const { classes, theme } = props;
  const [actionOpen, setActionOpen] = React.useState(false);
  const [actionWeakOpen, setActionWeakOpen] = React.useState(false);
  const {mainCtx, setMainCtx} = React.useContext(MainContext);

  const addAction = () => {
    if (!actionOpen){
      setActionOpen(true);
      return;
    }
  }

  const blurDisables = () => {
    if (!actionWeakOpen){
      setActionOpen(false);
    }
  }
  return (
    <div className={classes.actionToolBarOuter}
      onBlur={blurDisables}
      onMouseLeave={() => setActionWeakOpen(false)}
    >
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
            className={!(mainCtx.item && mainCtx.action === "view") ? classes.hidden : classes.actionToolBarButton}
            aria-label="edit"
          >
            <EditIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add Element" arrow>
          <NativeSelect
            className={(actionWeakOpen || actionOpen || mainCtx.action === "add") ? classes.newItemSelect : classes.hidden}
            onChange={(event: any) => setMainCtx({
              ...mainCtx,
              action: "add",
              item: null,
              type: event.target.value
            })}
            value={mainCtx.item || undefined}
            children={
              createOptionsIterator(elements)
            }
          />
        </Tooltip>
        <Tooltip title="Add" arrow>
          <IconButton
            className={(actionWeakOpen || actionOpen || mainCtx.action === "add") ? classes.hidden : classes.actionToolBarButton}
            aria-label="add"
            onClick={addAction}
            onMouseEnter={() => setActionWeakOpen(true)}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
        <IconButton
            className={classes.actionToolBarButton}
            aria-label="help"
          >
            <HelpOutlineOutlinedIcon />
          </IconButton>
      </Toolbar>
    </div>
  );
}

export default themeComponent(ActionBar);
