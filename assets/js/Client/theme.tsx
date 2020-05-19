
import { fade, withStyles, withTheme, Theme } from "@material-ui/core/styles";

const drawerWidth = "16rem";

export const secretgraphTheme = (theme: Theme) => ({
  root: {
    display: "flex",
    flexDirection: "column"
  },
  appBar: {
    transition: theme.transitions.create(['margin', 'width'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
  },
  appBarShift: {
    width: `calc(100% - ${drawerWidth})`,
    marginLeft: theme.direction === "ltr" ? drawerWidth : 0,
    transition: theme.transitions.create(['margin', 'width'], {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
  },
  appBarToolBar : {
  },
  appBarTitle : {
    flexGrow: 1,
    marginLeft: "3rem",
  },
  menuButton: {
  },
  userButton: {
  },
  newItemSelect: {
    display: "none",
  },
  newItemSelectOpen: {
    minWidth: "200px",
  },
  drawer: {
    width: drawerWidth,
    flexShrink: 0,
  },
  drawerPaper: {
    width: drawerWidth,
  },
  sideBarHeaderSelect: {
    width: "100%"
  },
  sideBarHeader: {
    // necessary for content to be below app bar
    ...theme.mixins.toolbar,
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(0, 1),
    justifyContent: "flex-end",
  },
  sideBarBody: {
    overflowY: "auto"
  },
  actionToolBarOuter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  actionToolBarInner: {
    backgroundColor: "blue",
    color: "white",
    padding: theme.spacing(0),
    borderRadius: "15px 15px 0 0",
    border: "1px solid black",
    margin: theme.spacing(0, 1, 0, 0),
  },
  actionToolBarButton: {
    color: 'white',
  },
  mainSection: {
    borderRadius: "5px",
    border: "1px solid black",
    minHeight: "100px",
    flexGrow: 1,
  },
  content: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    padding: theme.spacing(1),
    transition: theme.transitions.create(['margin', 'width'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
  },
  contentShift: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    padding: theme.spacing(1),
    transition: theme.transitions.create(['margin', 'width'], {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: theme.direction === "ltr" ? drawerWidth : 0,
  },
});

export function themeComponent(component: any) {
  return withStyles(secretgraphTheme)(withTheme(component));
}
