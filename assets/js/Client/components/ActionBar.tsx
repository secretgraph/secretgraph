
import * as React from "react";
import { themeComponent } from "../theme";
import Button from '@material-ui/core/Button';
import Toolbar from "@material-ui/core/Toolbar";
import Tooltip from '@material-ui/core/Tooltip';
import { Theme } from "@material-ui/core/styles";
import IconButton from "@material-ui/core/IconButton";
import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import AsyncSelect from 'react-select/async';

type Props = {
  buttonHandler: any,
  classes: any,
  theme: Theme,
};


export default themeComponent((props: Props) => {
  const { classes, theme, buttonHandler } = props;
  const [actionOpen, setActionOpen] = React.useState(false);
  let newItem = null;
  const loadOptions = (inputValue: any, callback: any) => {
    callback("sdssd");
  };

  if (actionOpen) {
    newItem = (
      <AsyncSelect
        cacheOptions
        loadOptions={loadOptions}
        className={classes.newItemSelect}
        onInputChange={() => setActionOpen(false)}
        onBlur={() => setActionOpen(false)}
      />
    );
  }
  const closeAdd = (
    event: React.KeyboardEvent | React.MouseEvent,
  ) => {
    if (
      event.type === 'keydown' &&
      ((event as React.KeyboardEvent).key === 'Tab' ||
        (event as React.KeyboardEvent).key === 'Shift')
    ) {
      return;
    }
    setActionOpen(false);
  };

  const addAction = () => {
    if (!actionOpen){
      setActionOpen(true);
      return;
    }
  }
  return (
    <Toolbar className={classes.actionToolBar}
      onKeyDown={closeAdd}
    >
      <span className={classes.actionToolBarInner}>
        <Tooltip title="Edit" arrow>
          <IconButton
            className={classes.actionToolBarButton}
            aria-label="edit"
          >
            <EditIcon />
          </IconButton>
        </Tooltip>
        {newItem}
        <Tooltip title="Add" arrow>
          <IconButton
            className={classes.actionToolBarButton}
            aria-label="add"
            onClick={addAction}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </span>
    </Toolbar>
  );
})


/**
export default class ActionBar extends React.Component<Props> {
  render() {
    return (
      <div
        value={value}
        onChange={handleChange}
        indicatorColor="primary"
        textColor="primary"
        scrollButtons="auto"
        aria-label=""
      ><Tooltip title="Add" arrow>
  <Button>Arrow</Button>
</Tooltip>
        <Tab label="Item Two" {...a11yProps(1)} />
        <Tab label="Item Three" {...a11yProps(2)} />
      </Tabs>
    );
  }

}
*/
