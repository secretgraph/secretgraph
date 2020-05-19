
import * as React from "react";
import { themeComponent } from "../theme";
import Button from '@material-ui/core/Button';
import Toolbar from "@material-ui/core/Toolbar";
import Tooltip from '@material-ui/core/Tooltip';
import { Theme } from "@material-ui/core/styles";
import IconButton from "@material-ui/core/IconButton";
import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import Select from 'react-select';

type Props = {
  classes: any,
  theme: Theme,
  action: any,
  currentItem: any
};

export default themeComponent((props: Props) => {
  const { classes, theme, action, currentItem } = props;
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
        <Tooltip title="Edit" arrow>
          <IconButton
            className={classes.actionToolBarButton}
            aria-label="edit"
          >
            <EditIcon />
          </IconButton>
        </Tooltip>
        <Select
          className={(actionWeakOpen || actionOpen) ? classes.newItemSelectOpen : classes.newItemSelect}
          onInputChange={() => setActionOpen(false)}
          options={options}
        />
        <Tooltip title="Add" arrow>
          <IconButton
            className={classes.actionToolBarButton}
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
