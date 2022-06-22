# structure

## django

-   constants: contains constants
-   server: server component for raw data. Has some views for non graphql
-   proxy: presents react part to user
-   user: Quota user, some views for editing user
-   tools: user facing tools
-   utils: utilities for implementations
-   schema.py: merged schema

## misc

-   assets: Client react stuff
-   tests: tests

# Special

## Permissions

-   manage: can change and create clusters, full access like admin
-   create: can add or move contents to cluster TODO: should check permission of cluster it moves from
-   delete: can delete contents or clusters and contents (depending on scope)
-   update: update contents or clusters (depending on scope)
-   push: create subcontents via push
-   view: view contents and or clusters (depending on scope)

## Limited API

This API contains only basic information and no informations like ids.
It is a fallback API in case a cluster is not allowed to be read by tokens.
The contents are limited to PublicKey types

## Shortcut creation of keys

With keys argument a keypair can be created or a privatekey associated with a publickey
Specified references are distributed between privatekey and publickey.
key refs are assigned to privatekey, the rest to the public key

## Special references

-   group "key": extra holds encryped shared key
-   group "signature": extra holds signature for public key
-   group "public_key": special, auto generated reference. Links private key with public key

## request

### GET or header

-   key=key hash:sharedkey : decrypt on the fly with key as crypto key (or X-Key Header)
-   prekey=key hash:encrypted sharedkey/key of private key : opens pw form to decrypt prekey (only GET parameter)
-   token=flexid/global flexid:token: Auth token (or Authorization Header)
-   key_hash=hash: retrieve keys with hash (or X-KEY-HASH Haader)

## Special tags

-   key_hash: 2 needed except for keys (1 needed)
-   key: special, required tag for PrivateKey. Contains encrypted shared secret
-   id: fully qualified (including type information (Content))

## Actions

-   delete fake type deletes an action. "delete" can be also just ""delete"" (json string). Key is not required and ignored
    -   for all
-   auth (Content, Cluster) affects (Content, Cluster). For onetime auth token for authenticating thirdparty:
    -   for Content:
        -   fetch: autodelete content after viewing
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
-   view (Content, Cluster) affects (Content, Cluster):
    -   for Content:
        -   fetch: autodelete content after viewing
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
-   delete (Content, Cluster):
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
-   update (Content, Cluster) affects (Content, Cluster) (has default view permission):
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag,
    -   freeze: cannot update after being viewed
    -   restricted: raise priority among filters only explicit specified
    -   injectedTags: force inject tags
    -   allowedTags: allow only tags specified here (if set)
-   create (Cluster, partly implemented):
    -   injectedTags: force inject tags
    -   allowedTags: allow only tags specified here (if set)
    -   not implemented yet (view and)
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[type=PrivateKey\]
-   inject (Cluster, Content): injects injectedTags, requiredKeys,
    -   requiredKeys: require keys within array for encryption
    -   injectedTags: force inject tags
    -   allowedTags: allow only tags specified here (if set)
    -   not implemented yet (view and)
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[type=PrivateKey\]
-   push (Content):
    -   freeze: cannot update after be viewed
    -   updateable: can update newly created content
    -   requiredKeys: require keys within array for encryption
    -   injectedReferences: force inject references to Contents, entries have following props:
        -   target: id of content
        -   group: group name
        -   deleteRecursive: group behaviour:
    -   injectedTags: force inject tags
    -   allowedTags: allow only tags specified here (if set)
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
        -   Cluster: map id updated fields
        -   Content: map id updated fields
        -   Action: map keyHash updated fields

## Operations (Mutations)

idea: unique operation names. It would be nice to have namespaces like for queries

-   updateOrCreateContent: what it says
-   updateOrCreateCluster: what it says, can create keys
-   updateMetadata: update metadata of content
-   pushContent: special operation for pushing encrypted or unencrypted content into system
-   regenerateFlexid: shuffles (flex)id of content or cluster. Useful if somethings should be hidden.
-   deleteContentOrCluster: mark cluster or content for deletion (in case of cluster also to children)
-   resetDeletionContentOrCluster: reset deletion mark

# Internal

Describe how internal plugins works

## includeTypes and excludeTypes

includeTypes is stronger than excludeTypes, it disables excludeTypes

## Security concept

The idea is, that data can be stored on limitted trustworthy servers.
Missing patches should ideally not affect the security
For this we have two defense mechanism

-   e2e Data encryption for preventing server leaks
-   with tokens (keys for servers) encrypted auth informations to prevent forgery by server and having an access control

## encryption for non-secretgraph users

currently there are three ways:

-   via X-KEY-HASH header, key_hash GET parameter: you get a list of shared keys and signatures matching the key_hash.
    The shared keys may have a link to the private key (only if permission)
    -   decrypt the shared key directly
    -   decrypt the shared key via private key
-   X-Key, key GET parameter: provide the key and get the decrypted result back (implements both decryption methods, direct and via private key)

### why via private key

-   otherwise the shared key could not be changed. This is especially an issue for often updated contents

## ContentActions

### clean returnal

-   freeze: together with "fetch" content group of views updates will be disabled
-   form: create new content
    -   updateable
    -   freeze

### Groups

idea: seperate actions with different concerns.

-   "": default
-   view: for view actions
-   fetch: (special group) autodelete contents if all fetch contentActions are used

# FAQ

## Why two languages?

-   js is not mature enough for web servers. Dependency hell with security holes.

## Why id for updates

-   fixes problem with lost updates, especially for hot files like config

## Action updates

-   via json variant of "delete" actions can be deleted
-   actions are identified either by their hash or id

# JS

-   updateConfig doesn't persist state in browser, use saveConfig for this

# TODO

-   X-Key response: shared key of private key
-   port settings importer to formik
-   hash algo should be part of hashes hash?????
-   how to seperate keys from tokens???
    -   different GET parameter
    -   key_hash for retrieving keys
-   decrypt import urls
-   implement settings/config
-   too many queries when selecting node (sidebar is also updated, because updateId?)
-   modernize ActionDialog, redesign, multi column?
-   modernize Keys, expose actions
-   implement shareFn and ShareDialog, Config has Special ShareDialog
-   update internal doc section
-   replace json-editor by ActionConfigurator equivalent
-   tags: limit amount tags
-   use serialized algo name for certificates/tokens? issue: everyone names algorithms different+there are algorithms with parameters
    -   partly solved
-   test permissions
-   disable editing/or prompt for tokens if tokens are missing
-   find better way to get hash algorithm (python)
-   edge-serverside encryption
-   document permissions, specialize
-   cleanup js structure, harmonize naming
-   updateId in form
-   prekey implement form
-   implement form with send for Message
-   if type=Message switch strings to Inbox, Send
-   find way how Messages sent can be differed from messages received

# TODO later

-   harmonize incl/exclFilter and allowedTags specs (maybe)
-   transform iter_decrypt_contents into QuerySet (maybe)
-   subscribe to config, watch changes
-   delete: limit amount?
-   metadata: limit amount of changed contents/clusters
