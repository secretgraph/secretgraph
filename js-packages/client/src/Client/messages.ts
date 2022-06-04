declare var gettext: any

export const initializeHelp = gettext(
    'Thanks for using secretgraph. To start select a provider and press start. You may have to register a user account'
)
export const initializeLabel = gettext('Start')
export const importFileLabel = gettext('Settings file to import')
export const importUrlLabel = gettext('Settings url to import')
export const importHelp = gettext('Import settings to restore old state')
export const importStartLabel = gettext('Import settings')

export const passwordLabel = gettext('Password')
export const decryptingPasswordSettingsHelp = gettext(
    'Enter password for decrypting settings.'
)
export const encryptingPasswordSettingsHelp = gettext(
    'Enter password for encrypting generated settings. Leave empty for no encryption.'
)

export const newClusterLabel = gettext('New Cluster')
