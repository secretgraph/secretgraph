# Actions

-   delete fake type deletes an action. "delete" can be also just ""delete"" (json string). Key is not required and ignored
    -   for all action definitions
    -   requires existingHash
-   auth (Content, Cluster) affects (Content, Cluster). For onetime auth token for authenticating thirdparty: Should be defined together with view for of permanent/temporary access to data
    -   requester: requester
    -   challenge: challenge data
    -   signatures: signatures of challenge data (at least 1)
    -   for Content: ignores inherited id exclusion
    -   for Cluster: adhers inherited id exclusion
-   view (Content, Cluster) affects (Content, Cluster):
    -   allowPeek: allow peeking at content (not triggering freeze or update readStatistic)
    -   for Content:
        -   fetch: autodelete content after viewing
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
        -   states:like param, include only contents with state
        -   includeTypes: like param, include only contents with type
        -   excludeTypes: like param, exclude contents with type, default: \[\]
-   delete (Content, Cluster):
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
        -   states:like param, include only contents with state
        -   includeTypes: like param, include only contents with type
        -   excludeTypes: like param, exclude contents with type, default: \[\]
-   update (Content, Cluster) affects (Content, Cluster) (has default view and peek permission). For updating contents:
    -   injectedTags: force inject tags, use freeze tag to freeze after viewing
    -   injectedReferences: force inject references
    -   allowedTags: allow only tags specified here (if set)
    -   allowedStates: allow only states specified here (if set)
    -   allowedActions: allow only actions specified here (if set) (Default: [])
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag,
-   create (Cluster, partly implemented). For creating contents:
    -   injectedTags: force inject tags
    -   injectedReferences: force inject references
    -   allowedTags: allow only tags specified here (if set)
    -   allowedStates: allow only states specified here (if set)
    -   allowedActions: allow only actions specified here (if set) (Default: [])
-   inject (Cluster, Content): injects injectedTags, injectedReferences
    -   injectedTags: force inject tags
    -   injectedReferences: force inject references
        allowed{Tags,Types,States}: apply injection only if there is a match with the input
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
        -   states:like param, include only contents with state
        -   includeTypes: like param, include only contents with type
        -   excludeTypes: like param, exclude contents with type, default: \[\]
-   push (Content):
    -   updateable: can update newly created content
    -   injectedReferences: force inject references to Contents, entries have following props:
        -   target: id of content
        -   group: group name
        -   deleteRecursive: group behaviour:
    -   injectedTags: force inject tags
    -   allowedTags: allow only tags specified here (if set)
    -   allowedStates: allow only states specified here (if set)
-   manage (Cluster) affects (Action, Content, Cluster):
    -   exclude:
        -   Cluster: ids of clusters which are excluded
        -   Content: ids of contents which are excluded
        -   Action: keyHashes of actions which are excluded
-   storedUpdate (Cluster):
    -   delete:
        -   Cluster: ids of clusters which are deleted
        -   Content: ids of contents which are deleted
        -   Action: keyHashes of actions which are deleted
    -   update:
        -   Cluster: map id updated fields (only some)
        -   Content: map id updated fields (only some)
        -   Action: map keyHash updated fields (only some)

The action existingHash field can be used to replace actions with the hash specified by existingHash (if you have the permission for replacing). The placeholders `value: action: "delete"` or `value: "delete"` can be used to simply delete actions with the hash of the content/cluster

## ContentActions

### clean returnal

-   updateable
-   nets: (only for contents): specify which resource net to use. nets are addressed by clusters

### Groups

idea: seperate actions on contents with different concerns.

-   "": default
-   view: for view actions
-   fetch: (special group) autodelete contents if all fetch contentActions are used
