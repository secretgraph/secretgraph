
import {
  fade,
  withStyles,
  makeStyles,
  createStyles,
  Theme,
  useTheme
} from "@material-ui/core/styles";

const drawerWidth = "16rem";

export function secretgraphTheme(theme: Theme) {
  return {
    root: {
      display: "grid",
      gridTemplateColumns: "auto 1fr",
    },
    subRoot: {
      minHeight: "100vh" as const
    },
    appBar: {
      gridRowStart: 1,
      gridRowEnd: 1,
      transition: theme.transitions.create(['margin', 'width'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
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
    drawerOpen: {
      gridColumnStart: 1,
      gridColumnEnd: 1,
      gridRowStart: 1,
      gridRowEnd: 2,
      width: drawerWidth,
      height: "100vh"
    },
    draweClosed: {
      gridColumnStart: 1,
      gridColumnEnd: 1,
      gridRowStart: 1,
      gridRowEnd: 2,
      width: 0
    },
    drawerPaper: {
      width: drawerWidth,
      overflowY: "auto" as const
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
      minHeight: "200px" as const,
      flexGrow: 1,
    },
    content: {
      gridRowStart: 2,
      gridRowEnd: 2,
      display: "flex" as const,
      flexDirection: "column" as const,
      padding: theme.spacing(1),
      transition: theme.transitions.create(['margin', 'width'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
      }),
    },
    buttonProgress: {
      color: "primary",
    },
    sideBarHeaderExpandButton: {
      width: "100%",
    },
    sideBarHeaderExpandButtonIcon: {
      transition: theme.transitions.create('transform', {
        duration: theme.transitions.duration.shortest,
      }),
    },
    sideBarHeaderExpandButtonIconExpanded: {
      width: "100%",
      transform: 'rotate(180deg)',
    },
    sideBarContentList: {
      paddingLeft: theme.spacing(4)
    },
    sideBarEntry: {
      overflowWrap: 'anywhere' as const,
      wordWrap: 'break-word' as const
    },
    import_Wrapper: {
      display: "flex",
      flexDirection: "row" as const,
      alignItems: "stretch"
    },
    import_Item: {
      padding: theme.spacing(0, 1),
      textAlign: "center" as const
    },
    import_Url: {
      flexGrow: 1,
      padding: theme.spacing(0, 1),
    }
  }
}

export function themeComponent(component: any) {
  return withStyles(secretgraphTheme, {withTheme: true})(component);
}


export const useStyles = makeStyles(
  (theme: Theme) => createStyles(secretgraphTheme(theme))
);

export const useStylesAndTheme = () : {classes: any, theme:Theme} => {
  return {
    classes: useStyles(),
    theme: useTheme()
  };
}
