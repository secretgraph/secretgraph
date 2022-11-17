import '@mui/lab/themeAugmentation'

import { Theme, createTheme, responsiveFontSizes } from '@mui/material/styles'

declare var gettext: any
/**
declare module '@mui/styles/defaultTheme' {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface DefaultTheme extends Theme {}
} */

declare module '@mui/material/styles' {
    interface Theme {
        contentStates: Map<string, { label: string }>
        contentStatesKey: Map<string, { label: string }>
    }
    // allow configuration using `createTheme`
    interface ThemeOptions {
        contentStates: Map<string, { label: string }>
        contentStatesKey: Map<string, { label: string }>
    }
}

export const drawerWidth = '22rem'

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
        contentStates: new Map([
            ['draft', { label: gettext('Draft') }],
            ['internal', { label: gettext('Internal') }],
            ['public', { label: gettext('Public') }],
        ]),
        contentStatesKey: new Map([
            ['internal', { label: gettext('Internal') }],
            ['public', { label: gettext('Public') }],
            ['trusted', { label: gettext('Trusted') }],
            ['required', { label: gettext('Required') }],
        ]),
    })
)
