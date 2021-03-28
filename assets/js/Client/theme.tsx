import {
    Theme,
    createMuiTheme,
    createStyles,
    makeStyles,
    responsiveFontSizes,
    useTheme,
    withStyles,
} from '@material-ui/core/styles'

const drawerWidth = '16rem'

export const theme = responsiveFontSizes(
    createMuiTheme({
        overrides: {
            MuiTreeItem: {
                iconContainer: {
                    width: 'auto',
                    maxWidth: '15px',
                },
            },
        } as any,
    })
)

export function secretgraphTheme(theme: Theme) {
    return {
        rootShifted: {
            height: '100vh',
            display: 'grid',
            grid: `
        'sidebar header' min-content
        'sidebar content' 1fr
        / ${drawerWidth} 1fr
      `,
        },
        root: {
            height: '100vh',
            display: 'grid',
            grid: `
        'sidebar header' min-content
        'sidebar content' 1fr
        / 0 1fr
      `,
        },
        appBar: {
            gridArea: 'header',
            transition: theme.transitions.create(['margin', 'width'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
            }),
        },
        appBarToolBar: {},
        appBarTitle: {
            flexGrow: 1,
            wordBreak: 'break-all' as const,
            [theme.breakpoints.up('sm')]: {
                marginLeft: '2rem' as const,
            },
        },
        treeItemHeading: {
            // label
            fontSize: '1.5rem !important',
        },
        treeItemMarked: {
            bgcolor: 'green',
        },
        sidebarButton: {},
        userButton: {},
        hidden: {
            display: 'none' as const,
        },
        newItemSelect: {
            color: 'white' as const,
            direction: 'rtl' as const,
            verticalAlign: 'middle !important',
            '& .MuiInputBase-root': {
                color: 'white' as const,
                fontSize: '120% !important' as const,
            },
        },
        drawerPaper: {
            width: drawerWidth,
            overflowY: 'auto' as const,
        },
        sideBarHeaderSelect: {
            width: '100%' as const,
            marginTop: '3px' as const,
        },
        sideBarHeader: {
            // necessary for content to be below app bar
            ...theme.mixins.toolbar,
            display: 'flex' as const,
            alignItems: 'center' as const,
            padding: theme.spacing(0, 1),
            justifyContent: 'flex-end' as const,
        },
        sideBarBody: {
            overflowY: 'auto' as const,
            paddingRight: '3px' as const,
        },
        actionToolBarOuter: {
            display: 'flex' as const,
            alignItems: 'center' as const,
            justifyContent: 'flex-end' as const,
        },
        actionToolBarInner: {
            backgroundColor: 'blue' as const,
            color: 'white' as const,
            padding: 0,
            borderRadius: '15px 15px 0 0' as const,
            border: '1px solid black' as const,
            margin: theme.spacing(0, 1, 0, 0),
        },
        actionToolBarButton: {
            color: 'white' as const,
        },
        mainSection: {
            minHeight: '200px' as const,
            flexGrow: 1,
            padding: theme.spacing(1),
            overflowY: 'auto' as const,
        },
        content: {
            gridArea: 'content',
            display: 'flex' as const,
            flexDirection: 'column' as const,
            padding: theme.spacing(1),
            transition: theme.transitions.create(['margin', 'width'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
            }),
            overflowY: 'auto' as const,
        },
        buttonProgress: {
            color: 'primary',
        },
        sideBarHeaderExpandButton: {
            width: '100%',
        },
        sideBarHeaderExpandButtonIcon: {
            transition: theme.transitions.create('transform', {
                duration: theme.transitions.duration.shortest,
            }),
        },
        sideBarHeaderExpandButtonIconExpanded: {
            width: '100%',
            transform: 'rotate(180deg)',
        },
        sideBarContentList: {
            paddingLeft: theme.spacing(4),
        },
        sideBarEntry: {
            overflowWrap: 'anywhere' as const,
            wordWrap: 'break-word' as const,
        },
        import_Wrapper: {
            display: 'flex',
            flexDirection: 'row' as const,
            alignItems: 'stretch',
        },
        import_Item: {
            padding: theme.spacing(0, 1),
            textAlign: 'center' as const,
        },
        import_Url: {
            flexGrow: 1,
            padding: theme.spacing(0, 1),
        },
    }
}

export function themeComponent(component: any) {
    return withStyles(secretgraphTheme, { withTheme: true })(component)
}

export const useStyles = makeStyles((theme: Theme) =>
    createStyles(secretgraphTheme(theme))
)

export const useStylesAndTheme = (): {
    classes: ReturnType<typeof useStyles>
    theme: Theme
} => {
    return {
        classes: useStyles(),
        theme: useTheme(),
    }
}
