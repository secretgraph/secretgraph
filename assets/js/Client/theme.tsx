
import { withStyles, withTheme, Theme } from "@material-ui/core/styles";

const drawerWidth = "16rem";

export const theme = (theme: Theme) => ({
  root: {
    display: "flex",
  },
  appBar: {
  },
  drawerHeaderSelect: {
    width: "100%"
  },
  appBarShift: {
    width: `calc(100% - ${drawerWidth})`,
    marginLeft: "auto",
    transition: theme.transitions.create(["width"], {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
  },
  menuButton: {
    marginRight: theme.spacing(2),
  },
  userButton: {
    marginRight: theme.spacing(2),
  },
  hide: {
    display: "none",
  },
  drawer: {
    width: drawerWidth,
    flexShrink: 0,
  },
  drawerPaper: {
    width: drawerWidth,
  },
  drawerHeader: {
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(0, 1),
    // necessary for content to be below app bar
    ...theme.mixins.toolbar,
    justifyContent: "flex-end",
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing(3),
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    marginLeft: -drawerWidth,
  },
  contentShift: {
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: 0,
  },
});

export function themeComponent(component: any) {
  return withStyles(theme)(withTheme(component));
}
