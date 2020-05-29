
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


type Props = {
  classes: any,
  theme: Theme,
  mainContext: any,
  setMainContext: any
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


export default themeComponent((props: Props) => {
  const { classes, theme, mainContext, setMainContext } = props;
  const [actionOpen, setActionOpen] = React.useState(false);
  const [actionWeakOpen, setActionWeakOpen] = React.useState(false);

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
            className={(mainContext.action === "help") ? classes.hidden : classes.contentStateSelect}
            onChange={(event: any) => setMainContext({
              ...mainContext,
              state: event.target.value
            })}
            value={mainContext.state}
            children={
              createOptionsIterator(contentStates)
            }
          />
        </Tooltip>
        <Tooltip title="Edit" arrow>
          <IconButton
            className={!(mainContext.item && mainContext.action === "view") ? classes.hidden : classes.actionToolBarButton}
            aria-label="edit"
          >
            <EditIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add Element" arrow>
          <NativeSelect
            className={(actionWeakOpen || actionOpen || mainContext.action === "add") ? classes.newItemSelect : classes.hidden}
            onChange={(event: any) => setMainContext({
              ...mainContext,
              action: "add",
              item: event.target.value
            })}
            value={mainContext.item}
            children={
              createOptionsIterator(elements)
            }
          />
        </Tooltip>
        <Tooltip title="Add" arrow>
          <IconButton
            className={(actionWeakOpen || actionOpen || mainContext.action === "add") ? classes.hidden : classes.actionToolBarButton}
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
})
