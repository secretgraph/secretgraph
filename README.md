# Installation

## Docker

```sh
docker-compose up -d
# or
podman-compose up -d
```

Note: you should change the SECRET_KEY and ALLOWED_HOSTS via override

It is now ready of running behind reverse proxies.

## Manually (production)

Requirements:

-   python3 environment
-   npm (and nodejs) (should be at least last lts)

```sh
# remove not used databases
# instead of hypercorn you can install any other asgi server
pip install --no-cache .[server,postgresql,mysql] hypercorn[h3]
npm install
npm run build
python ./manage.py collectstatic --noinput
# hypercorn or whatever
hypercorn secretgraph.asgi:application
```

## debug

```sh
./tools/debugrun.py
```

# structure

It is currently a monorepo containing js and python parts

## django

-   secretgraph.server: server component for raw data. Has some views for non graphql
-   secretgraph.proxy: presents react part to user
-   secretgraph.user: Quota user, some views for editing user
-   secretgraph.settings: settings part
-   secretgraph.schema: merged schema
-   secretgraph.urls: urls
-   secretgraph.asgi: asgi entrypoint (should be used)
-   secretgraph.wsgi: wsgi entrypoint (legacy)
-   tests: tests

## python (without django)

-   secretgraph.tools: user facing tools
-   secretgraph.core
    -   constants: contains constants
    -   utils: misc utils without django requirement

## js part

-   assets: loader for js part
-   js-packages: js packages
-   webpack and npm related files

# Server Settings

## direct

server settings can be done in the standard django way. The derivated settings should import `secretgraph.settings`

Special configuration keys:

-   `SECRETGRAPH_BIND_TO_USER`: require the binding of nets to user accounts
-   `SECRETGRAPH_ALLOW_REGISTER`: boolean, default False:.True allows registering new accounts. In case of `SECRETGRAPH_BIND_TO_USER` is True, normal login is required and `SIGNUP_URL` is for `registerUrl` returned

## docker

-   `BIND_TO_USER`: nets need user
-   `ALLOW_REGISTER`: allow registering new users
-   `ALLOWED_HOSTS`: listen to hosts (default localhost)
-   `DB_ENGINE`: db stuff
-   `DB_USER`: db stuff
-   `DB_PASSWORD`: db stuff
-   `DB_HOST`: db stuff
-   `DB_PORT`: db stuff

# API

## Permissions (cluster)

-   manage: can change and create clusters, full access like admin
-   create: can add or move contents to cluster TODO: should check permission of cluster it moves from
-   delete: can delete contents or clusters and contents (depending on scope)
-   update: update contents or clusters (depending on scope)
-   push: create subcontents via push
-   view: view contents and or clusters (depending on scope)
-   auth: one-time view with intent to signal auth event

## Global group properties:

-   default: on cluster creation these groups are added by default except if groups are explicit specified
-   register_global_name: can register a global cluster name
-   manage_featured: can feature or unfeature clusters (only global clusters can be featured)
-   manage_hidden: can see hidden contents, can set hidden state
-   manage_groups: can manage global groups of clusters
-   manage_deletion: can delete every content or cluster
-   manage_update: can update every content or cluster (but has still no access to data if encrypted)
-   auto_hide_local: clusters with a group with this property have their public contents auto hidden if they are not a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with manage_hidden permission)
-   auto_hide_local_update: clusters with a group with this property have their public contents auto hidden after an update if they are not a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with manage_hidden permission)
-   auto_hide_global: clusters with a group with this property have their public contents auto hidden if they are a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with manage_hidden permission)
-   auto_hide_global_update: clusters with a group with this property have their public contents auto hidden after an update if they are a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with manage_hidden permission)

## Shortcut creation of keys

With keys argument a keypair can be created or a privatekey associated with a publickey
Specified references are distributed between privatekey and publickey.
key refs are assigned to privatekey, the rest to the public key

## Special references

-   group "key": extra holds encryped shared key
-   group "signature": extra holds signature for public key
-   group "public_key": special, auto generated reference. Links private key with public key

## graphql api

### Authorization header

-   flexid/global flexid:token: Auth token (only if authorization is not specified) or via authorization attribute

## contents request api

### GET or header

-   key=key hash:sharedkey (privatekey way) or key=content id:sharedkey (direct way) : decrypt on the fly with key as crypto key (or X-Key Header)
-   token=flexid/global flexid:token: Auth token (or Authorization Header)
-   key_hash=hash: retrieve keys with hash (or X-KEY-HASH Header)

Not implemented yet

-   prekey=key hash:encrypted sharedkey/key of private key : opens pw form to decrypt prekey, requires iteration parameter (only GET parameter)
-   iterations=key hash:encrypted sharedkey/key of private key : opens pw form to decrypt prekey (only GET parameter)

## decryption for non-secretgraph users

Prequisite: you specified valid tokens (at least 1)
currently there are three ways:

-   via X-KEY-HASH header, key_hash GET parameter: you get a list of shared keys and signatures matching the key_hash.
    The shared keys may have a link to the private key (only if permission)
    -   decrypt the shared key directly
    -   decrypt the shared key via private key
-   X-Key, key GET parameter: provide the key and get the decrypted result back (implements both decryption methods, direct and via private key)

why via private key:

Otherwise the shared key could not be changed. This is especially an issue for often updated contents

## Special tags and flags

-   key_hash: 1 needed except for keys (autogenerated), format algorithm:hash
-   key: special, required tag for PrivateKey. Contains encrypted shared secret
-   freeze: cannot change content after viewing/fetching (use of ContentAction group fetch/view), freeze will be transformed to immutable
-   immutable: cannot change content. Deletion only possible for manage permission
    -   to remove this flag manage_update permission is required and can only done via metadata update
    -   immutable does not prevent action metadata updates

## encrypted tags

Encrypted tags have the format: ~`key`=`b64encode aesgcm crypto string`, first 13 bytes are nonce. The key is the sharedkey of the content
If another cryptography method is used (e.g. key= tag of PrivateKey) then it should be not prefixed and manually encoded/decoded.
The helper expects a normal string and simply encrypts the string

## hashing

ContentHash: domain:algorithm:hash

leave domain empty to have an global domain. Normally the type is the domain

Special domains: Key for keys

key Hashing: algorithm:hash

hash Algorithm in Constants can contain / to specify arguments (convention)

## Actions

-   delete fake type deletes an action. "delete" can be also just ""delete"" (json string). Key is not required and ignored
    -   for all action definitions
-   auth (Content, Cluster) affects (Content, Cluster). For onetime auth token for authenticating thirdparty:
    -   for Content:
        -   fetch: autodelete content after viewing
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
        -   states:like param, include only contents with state
        -   includeTypes: like param, include only contents with type
        -   excludeTypes: like param, exclude contents with type, default: \[\]
-   view (Content, Cluster) affects (Content, Cluster):
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
-   update (Content, Cluster) affects (Content, Cluster) (has default view permission):
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag,
    -   injectedTags: force inject tags, use freeze tag to freeze after viewing
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

## includeTypes and excludeTypes

includeTypes is stronger than excludeTypes, it disables excludeTypes

## Security concept

The idea is, that data can be stored on limited trustworthy servers.
Missing patches should ideally not affect the security
For this we have two defense mechanism

-   e2e Data encryption for preventing server leaks
-   with tokens (keys for servers) encrypted auth informations to prevent forgery by server and having an access control

## ContentActions

### clean returnal

-   updateable
-   nets: (only for contents): specify which resource net to use. nets are addressed by clusters

### Groups

idea: seperate actions on contents with different concerns.

-   "": default
-   view: for view actions
-   fetch: (special group) autodelete contents if all fetch contentActions are used

## Config

Config defines slots. Config Updates will be send to all Configs with a same slot. The first slot is the main slot.
Currently there is no way to move items from one config to another

# Internal

## Net? Cluster? Contents? References?

Net is an alias for a user or system account. It contains resource tracking and limits.
Its visibility is limited to cluster admins and admins.
Clusters are assigned to a net. They consist of contents and are responsible for permissions
(Contents can have some limited permissions).
Permissions are defined by actions which are a token permission mapping. A special permission is manage. It allows if the right cluster groups attributes are set that admin like abilities are executed by the owner of the token
They include seeing hidden contents or even delete contents not owned by the user.
Content permissions are restricted to create subcontents according to a pattern, to update or to view.
Contents can link to each other (depending on permissions) via references. References can auto destroy the owner if the referenced object is deleted via the DeleteRecursive attribute.

## How does net resource tracking work?

Every user has a net. This net is required to be assigned to Clusters and optional for Contents (if not specified the net of the assigned cluster is used)-
The net contains a score how many bytes are roughly in use by the user.
To the amount of bytes contribute the name and description of every cluster as well as the parts of the content:

-   tags
-   references
-   value object

If no quota is set, there is no restriction otherwise only size reductions are possible.

Contents can have a different net than the net of the assigned cluster or content.
This allows messaging without clogging the inbox of the user (e.g. server announcements, advertisments).
The system cluster (id=0) has no quota (it will be removed after every migration)

# Caveats

## Limited API

This API contains only basic information and no informations like ids.
It is a fallback API in case a cluster is not allowed to be read by tokens.
The contents are limited to PublicKey types

## Action updates

-   via json variant of "delete" actions can be deleted
-   actions are identified either by their hash or id

## JS updating config

-   updateConfig doesn't persist state in browser, use saveConfig for this

# FAQ

## Why 3party decryption via private key

The shared key can change, so safest assumption is that the key of the private key stays stable.
This way you invalidate the access by updating the encryption key of the private key.
The private key is not meccessary exposed to the user but there are some danger:
now you have a decryption key to the private key, that is very dangerous

## Why two languages?

-   js is not mature enough for web servers. It is a dependency hell with security holes.

## Why id for updates

-   fixes problem with lost updates, especially for hot files like config
-   but metadata can be changed seperately (removing/adding tags/references)

# TODO

-   disallow non global ids? Would ease implementation
-   port to real filters
-   move to dataclasses and TypedDicts
    -   nearly complete needs testing and TypedDicts
-   remove/handle orphan nets (no cluster assigned)
-   actions: states
-   implement settings/config
-   too many queries when selecting node (sidebar is also updated, because updateId?)
-   modernize ActionDialog, redesign, multi column?
-   modernize Keys, expose actions
-   implement shareFn and ShareDialog, Config has Special ShareDialog
-   update internal doc section
-   replace json-editor by ActionConfigurator equivalent
-   test permissions
-   disable editing/or prompt for tokens if tokens are missing
-   find better way to get hash algorithm (python)
-   edge-serverside encryption
-   document permissions, specialize
-   cleanup js structure, harmonize naming
-   updateId in form
-   prekey implement form

# TODO later

-   config: create a virtual global merge of all configs to get every token
-   allow alternate cryptoalgorithms instead of aesgcm for tags (except ChaCha20Poly1305 and AESSIV no good alternatives, and both aren't supported in browser)
-   cleanup user
-   support dsa
-   implement different net resource logic in frontend
-   move validation logic to validators
-   use more mainCtx.url instead of passing urls through
-   ratelimit API access per ip and per flexid
-   harmonize incl/exclFilter and allowedTags specs (maybe)
-   transform iter_decrypt_contents into QuerySet (maybe)
-   subscribe to config, watch changes
-   delete: limit amount?
-   metadata: limit amount of changed contents/clusters
-   implement form with send for Message
-   if type=Message switch strings to Inbox, Send
-   find way how Messages sent can be differed from messages received

# TODO far future

-   more async (needs better django support)
-   recovery:
    -   save a recovery token in remote identity provider (needs identity provider+ identity editor)
        -   can retrieve it via sms
        -   or identity verification (passport, e.g.)
-   moving / hiding by regenerating flexids
    1. list all providers
    2. issue an onetime update token for all of them and save it (with flexid relation)
    3. regenerate flexid / move content
    4. update providers via token
