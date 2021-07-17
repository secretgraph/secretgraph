import '@material-ui/lab/themeAugmentation'

import {
    Theme,
    createStyles,
    createTheme,
    responsiveFontSizes,
    useTheme,
} from '@material-ui/core/styles'
import { SxProps } from '@material-ui/system'

declare module '@material-ui/core/styles' {
    interface Theme {
        classes: Record<string, SxProps<Theme>>
    }
    // allow configuration using `createTheme`
    interface ThemeOptions {
        classes: Record<string, SxProps<Theme>>
    }
}

const drawerWidth = '16rem'

export const secretgraphTheme: Record<string, SxProps<Theme>> = {
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
        transition: (theme) =>
            theme.transitions.create(['margin', 'width'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
            }),
    },
    appBarToolBar: {},
    appBarTitle: {
        flexGrow: 1,
        wordBreak: 'break-all' as const,
        marginLeft: {
            sm: '2rem',
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
        minHeight: (theme) => theme.mixins.toolbar.minHeight,
        display: 'flex' as const,
        alignItems: 'center' as const,
        padding: (theme) => theme.spacing(0, 1),
        justifyContent: 'flex-end' as const,
    },
    sideBarBody: {
        overflowY: 'auto' as const,
        paddingRight: '3px' as const,
    },
    actionToolBarInner: {
        backgroundColor: 'blue' as const,
        color: 'white' as const,
        padding: 0,
        borderRadius: '15px 15px 0 0' as const,
        border: '1px solid black' as const,
        margin: (theme) => theme.spacing(0, 1, 0, 0),
        '& *': {
            color: 'white' as const,
        },
    },
    mainSection: {
        minHeight: '200px' as const,
        flexGrow: 1,
        padding: (theme) => theme.spacing(1),
        overflowY: 'auto' as const,
    },
    content: {
        gridArea: 'content',
        display: 'flex' as const,
        flexDirection: 'column' as const,
        padding: (theme) => theme.spacing(1),
        transition: (theme) =>
            theme.transitions.create(['margin', 'width'], {
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
        transition: (theme) =>
            theme.transitions.create('transform', {
                duration: theme.transitions.duration.shortest,
            }),
    },
    sideBarHeaderExpandButtonIconExpanded: {
        width: '100%',
        transform: 'rotate(180deg)',
    },
    import_Wrapper: {
        display: 'flex',
        flexDirection: 'row' as const,
        alignItems: 'stretch',
    },
    import_Item: {
        padding: (theme) => theme.spacing(0, 1),
        textAlign: 'center' as const,
    },
    import_Url: {
        flexGrow: 1,
        padding: (theme) => theme.spacing(0, 1),
    },
}
export const theme = responsiveFontSizes(
    createTheme({
        components: {
            MuiTreeItem: {
                styleOverrides: {
                    iconContainer: {
                        width: 'auto',
                        maxWidth: '15px',
                    },
                },
            },
            MuiTextField: {
                defaultProps: {
                    variant: 'outlined',
                },
            },
        },
        classes: secretgraphTheme,
    })
)
