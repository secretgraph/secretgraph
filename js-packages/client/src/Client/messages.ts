declare var gettext: any

export const initializeHelp = gettext(
    'Thanks for using secretgraph. To start select a provider and press start. You may have to register a user account'
)
export const initializeLabel = gettext('Start')
export const importFileLabel = gettext('Settings file to import')
export const importUrlLabel = gettext('Settings url to import')
export const importHelp = gettext('Import settings to restore old state')
export const importStartLabel = gettext('Import settings')

export const decryptingPasswordLabel = gettext(
    'Password for encrypted settings.'
)
export const decryptingPasswordHelp = gettext(
    'Enter password for decrypting settings.'
)
export const encryptingPasswordHelp = gettext(
    'Enter password for encrypting generated settings. Leave empty for no encryption.'
)
export const encryptingPasswordLabel = gettext(
    'Password for encrypting settings.'
)

export const newClusterLabel = gettext('New Cluster')
