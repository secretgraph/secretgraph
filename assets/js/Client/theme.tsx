
import { fade, withStyles, withTheme, Theme } from "@material-ui/core/styles";

const drawerWidth = "16rem";

export function secretgraphTheme(theme: Theme) {
  return {
    root: {
      display: "flex" as const,
      flexDirection: "column" as const,
      minHeight: "100vh" as const
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
      marginLeft: "3rem" as const,
    },
    sidebarButton: {
    },
    userButton: {
    },
    contentStateSelect: {
      marginLeft: theme.spacing(1),
      color: "white" as const,
      direction: "rtl" as const,
      fontSize: "120%" as const
    },
    hidden: {
      display: "none" as const,
    },
    newItemSelect: {
      color: "white" as const,
      direction: "rtl" as const,
      fontSize: "120%" as const
    },
    drawer: {
      width: drawerWidth,
      flexShrink: 0,
    },
    drawerPaper: {
      width: drawerWidth,
    },
    sideBarHeaderSelect: {
      width: "100%" as const,
      marginTop: "3px" as const
    },
    sideBarHeader: {
      // necessary for content to be below app bar
      ...theme.mixins.toolbar,
      display: "flex" as const,
      alignItems: "center" as const,
      padding: theme.spacing(0, 1),
      justifyContent: "flex-end" as const,
    },
    sideBarBody: {
      overflowY: "auto" as const,
      paddingRight: "3px" as const
    },
    actionToolBarOuter: {
      display: "flex" as const,
      alignItems: "center" as const,
      justifyContent: "flex-end" as const,
    },
    actionToolBarInner: {
      backgroundColor: "blue" as const,
      color: "white" as const,
      padding: 0,
      borderRadius: "15px 15px 0 0" as const,
      border: "1px solid black" as const,
      margin: theme.spacing(0, 1, 0, 0),
    },
    actionToolBarButton: {
      color: 'white' as const,
    },
    mainSection: {
      borderRadius: "5px" as const,
      border: "1px solid black" as const,
      minHeight: "100px" as const,
      flexGrow: 1,
    },
    content: {
      display: "flex" as const,
      flexDirection: "column" as const,
      flexGrow: 1,
      padding: theme.spacing(1),
      transition: theme.transitions.create(['margin', 'width'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
      }),
    },
    contentShift: {
      display: "flex" as const,
      flexDirection: "column" as const,
      flexGrow: 1,
      padding: theme.spacing(1),
      transition: theme.transitions.create(['margin', 'width'], {
        easing: theme.transitions.easing.easeOut,
        duration: theme.transitions.duration.enteringScreen,
      }),
      marginLeft: theme.direction === "ltr" ? drawerWidth : 0,
    },
    buttonProgress: {
      color: "primary",
    },
  }
}

export function themeComponent(component: any) {
  return withStyles(secretgraphTheme)(withTheme(component));
}
