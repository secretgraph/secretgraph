import { MainContextInterface } from '../interfaces'
export const validActions = new Set<MainContextInterface['action']>([
    'login',
    'register',
    'create',
    'view',
    'update',
    'help',
    'clone',
])
export const validNotLoggedInActions = new Set<MainContextInterface['action']>(
    ['login', 'register', 'help']
)

export const validFields: { [type: string]: { [key: string]: any } } = {
    authContent: { requester: '', challenge: '' },
    authCluster: { requester: '', challenge: '' },
    viewContent: { fetch: false, allowPeek: false },
    viewCluster: { allowPeek: false },
    deleteContent: {},
    deleteCluster: {},
    updateContent: {
        injectedTags: [],
        injectedReferences: [],
        allowedTags: [],
        allowedStates: [],
        allowedActions: [],
    },
    updateCluster: {
        injectedTags: [],
        injectedReferences: [],
        allowedTags: [],
        allowedStates: [],
        allowedActions: [],
    },
    injectContent: {
        injectedTags: [],
        injectedReferences: [],
        allowedTags: [],
        allowedStates: [],
        allowedActions: [],
    },
    injectCluster: {
        injectedTags: [],
        injectedReferences: [],
        allowedTags: [],
        allowedStates: [],
        allowedActions: [],
    },
    pushContent: {
        updateable: false,
        injectedTags: [],
        injectedReferences: [],
        allowedTags: [],
        allowedStates: [],
        allowedActions: [],
    },
    manage: {
        'exclude.Cluster': [],
        'exclude.Content': [],
        'exclude.Action': [],
    },
    storedUpdate: {
        'delete.Cluster': [],
        'delete.Content': [],
        'delete.Action': [],
        // TODO update
    },
}
for (const key of [
    'viewCluster',
    'deleteCluster',
    'updateCluster',
    'injectCluster',
]) {
    validFields[key]['includeTags'] = []
    validFields[key]['excludeTags'] = []
    validFields[key]['includeTypes'] = []
    validFields[key]['excludeTypes'] = []
    validFields[key]['states'] = []
}

export const public_states = new Set(['required', 'trusted', 'public'])
export const trusted_states = new Set(['required', 'trusted'])

export const UseCriteria = {
    TRUE: 'TRUE' as const,
    FALSE: 'FALSE' as const,
    IGNORE: 'IGNORE' as const,
}

export const UseCriteriaPublic = {
    TRUE: 'TRUE' as const,
    FALSE: 'FALSE' as const,
    IGNORE: 'IGNORE' as const,
    TOKEN: 'TOKEN' as const,
}

export const DeleteRecursive = {
    TRUE: 'TRUE' as const,
    FALSE: 'FALSE' as const,
    NO_GROUP: 'NO_GROUP' as const,
}

export const UserSelectable = {
    NONE: 'NONE' as const,
    UNRESTRICTED: 'UNRESTRICTED' as const,
    SELECTABLE: 'SELECTABLE' as const,
    DESELECTABLE: 'DESELECTABLE' as const,
    INITIAL_MODIFYABLE: 'INITIAL_MODIFYABLE' as const,
}

export const protectedActions = new Set<'storedUpdate' | 'auth'>([
    'storedUpdate',
    'auth',
])

export const contentStates = ['draft', 'protected', 'public']
export const contentStatesKey = ['protected', 'public', 'required', 'trusted']

export const stubCluster = Buffer.from('Cluster:-1').toString('base64')
export const stubContent = Buffer.from('Content:-1').toString('base64')
export const privateConfigKeys = new Set([
    'slots',
    'certificates',
    'configLockUrl',
    'configSecurityQuestion',
])
