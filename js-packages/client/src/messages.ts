declare var gettext: any

export const initializeHelp = gettext(
    'Thanks for using secretgraph. To start provide the url to a secretgraph provider and press Register. You may have to register a user account.'
)
export const registerLabel = gettext('Register')
export const importFileLabel = gettext('Settings file to import')
export const importUrlLabel = gettext('Settings url to import')
export const importHelp = gettext('Import settings to log into secretgraph')
export const importStartLabel = gettext('Import settings')

export const passwordLabel = gettext('Password')
export const decryptingPasswordSettingsHelp = gettext(
    'Enter password for decrypting settings.'
)
export const encryptingPasswordSettingsHelp = gettext(
    'Enter password for encrypting generated settings. Leave empty for no encryption.'
)

export const newClusterLabel = gettext('New Cluster')
