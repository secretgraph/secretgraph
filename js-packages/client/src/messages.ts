declare var gettext: any

export const initializeHelp = gettext(
    'Thanks for using secretgraph. To start provide the url to a secretgraph provider and press Register. You may have to register a user account.'
)

export const fileLabel = gettext('File')
export const urlLabel = gettext('Url')
export const registerUserLabel = gettext('Register (User)')
export const registerClusterLabel = gettext('Register (Cluster)')
export const loginLabel = gettext('Login')
export const loginFileHelp = gettext('Settings file for login')
export const loginUrlHelp = gettext('Settings url for login')
export const importHelp = gettext('Import settings to log into secretgraph')

export const passwordLabel = gettext('Password')
export const decryptingPasswordSettingsHelp = gettext(
    'Enter password for decrypting settings.'
)
export const encryptingPasswordSettingsHelp = gettext(
    'Enter password for encrypting generated settings. Leave empty for no encryption.'
)
export const slotSelectionHelp = gettext('Select config slot')

export const newClusterLabel = gettext('New Cluster')
