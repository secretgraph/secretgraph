
import * as React from "react";
import { themeComponent } from "../theme";
import Button from '@material-ui/core/Button';
import Toolbar from "@material-ui/core/Toolbar";
import Tooltip from '@material-ui/core/Tooltip';
import { Theme } from "@material-ui/core/styles";
import IconButton from "@material-ui/core/IconButton";
import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import NativeSelect from '@material-ui/core/NativeSelect';
import MenuItem from '@material-ui/core/MenuItem';
import { elements } from './elements';
import { contentStates } from '../constants';


type Props = {
  classes: any,
  theme: Theme,
  mainContext: any,
  setMainContext: any
};

export default themeComponent((props: Props) => {
  const { classes, theme, mainContext, setMainContext } = props;
  const [actionOpen, setActionOpen] = React.useState(false);
  const [actionWeakOpen, setActionWeakOpen] = React.useState(false);
  let editButton = null;

  if (mainContext.item && mainContext.action == "view"){
    editButton = (
      <Tooltip title="Edit" arrow>
        <IconButton
          className={classes.actionToolBarButton}
          aria-label="edit"
        >
          <EditIcon />
        </IconButton>
      </Tooltip>
    );
  }

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
            onChange={(event: any) => setMainContext({
              ...mainContext,
              state: event.target.value
            })}
            value={mainContext.state}
            children={
              contentStates.map((item: any) => (
                <option value={item.value} key={item.value}>{item.label}</option>
              ))
            }
          />
        </Tooltip>
        {editButton}
        <NativeSelect
          className={(actionWeakOpen || actionOpen || mainContext.action === "add") ? classes.newItemSelect : classes.hidden}
          onChange={(event: any) => setMainContext({
            ...mainContext,
            action: "add",
            item: event.target.value
          })}
          value={mainContext.item}
          children={
            elements.map((item: any) => (
              <option value={item.value} key={item.value}>{item.label}</option>
            ))
          }
        />
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
      </Toolbar>
    </div>
  );
})
