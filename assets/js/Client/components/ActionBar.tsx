
import * as React from "react";
import { useStyles } from "../theme";
import Button from '@material-ui/core/Button';
import Tooltip from '@material-ui/core/Tooltip';

type Props = {
  buttonHandler: any,
};

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
