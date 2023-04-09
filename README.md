# About

Secretgraph is a platform for online identities. You cna

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
-   `SECRETGRAPH_CACHE_DECRYPTED`: shall decrypted results be marked for caching (slightly insecure as decrypted results lay in the cache but maybe required for slow file backends). Only useful if server side decryption is required
-   `SECRETGRAPH_RATELIMITS`: required, set ratelimits for `GRAPHQL_MUTATIONS`, `GRAPHQL_ERRORS`, `ANONYMOUS_REGISTER`, `DECRYPT_SERVERSIDE`
    note: `GRAPHQL_ERRORS` is disabled in case `DEBUG` is on
    note: in case serverside decryption should be disabled set a ratelimit of "0/s" or (0, 1)

## docker

### secretgraph

-   `BIND_TO_USER`: nets need user
-   `ALLOW_REGISTER`: allow registering new users
-   `ALLOWED_HOSTS`: listen to hosts (default localhost)
-   `SECRETGRAPH_ADMINAREA`: allow admin login, needs `CSRF_TRUSTED_ORIGINS`
-   `CACHE_DECRYPTED`: activate `SECRETGRAPH_CACHE_DECRYPTED` in emergency for slow file backends and the requirement of proxy. Only useful if server side decryption is required.
-   `RATELIMIT_*` where as keys `GRAPHQL_MUTATIONS`, `GRAPHQL_ERRORS`, `ANONYMOUS_REGISTER`, `DECRYPT_SERVERSIDE` are defined: set ratelimits or remove the default with the special key: `none`
-   `DB_ENGINE`: db stuff
-   `DB_USER`: db stuff
-   `DB_PASSWORD`: db stuff
-   `DB_HOST`: db stuff
-   `DB_PORT`: db stuff

### nginx (docker-compose)

Only valid for the nginx template specified in this repo!. Note: you have to escape $ with another $

-   `SCHEME_HEADER`:
    -   `'$$scheme'` for automatic scheme detection
    -   `'https'`: for hardcoding the value
    -   `'$$http_x_forwarded_proto'`: or other header containing the protocol

# API

## Permissions (cluster or content)

-   manage: can change and create clusters, full access like admin
-   create: can add or move contents to cluster TODO: should check permission of cluster it moves from
-   delete: can delete contents or clusters and contents (depending on scope)
-   update: update contents or clusters
-   peek: can view contents without triggering freeze
-   push: create subcontents via push
-   view: view contents and or clusters (depending on scope)
-   auth: one-time view with intent to signal auth event

## Global group properties:

-   default: on cluster creation these groups are added by default except if groups are explicit specified
-   allow_global_name: can register a global cluster name
-   allow_dangerous_actions: can create dangerous actions (for user, e.g. deleting own stuff, currently only storedUpdate is locked behind)
-   manage_featured: can feature or unfeature clusters (only global clusters can be featured)
-   manage_hidden: can see hidden contents, can set hidden attribute, hidden groups of clusters become visible
-   manage_active: can can block and unblock nets (via Cluster ids)
-   manage_groups: can manage global groups of clusters, hidden groups of clusters become visible
-   manage_user: manage nets and can add some to user
-   manage_deletion: can delete every content or cluster
-   manage_update: can update every content or cluster (but has still no access to data if encrypted)
-   auto_hide_local: clusters with a group with this property have their public contents auto hidden if they are not a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with manage_hidden permission)
-   auto_hide_local_update: clusters with a group with this property have their public contents auto hidden after an update if they are not a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with manage_hidden permission)
-   auto_hide_global: clusters with a group with this property have their public contents auto hidden if they are a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with manage_hidden permission)
-   auto_hide_global_update: clusters with a group with this property have their public contents auto hidden after an update if they are a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with manage_hidden permission)

## Global group attributes

-   managed (only settings): settings definition of global group is binding

## States:

-   required: Only PublicKey, like trusted+required as encryption target
-   trusted: Only PublicKey, a trusted encryption target. At least one is required.
-   public: Unencrypted, can be read by everyone
-   protected: Encrypted, only visible with view permission (token)
-   draft: like protected + excempted from autohiding
-   sensitive: like protected + excluded by default, except especially requested. For sensitive stuff like medical data or NSFW

## Trusted Keys

### why not in actions anymore

There was an idea to save to save trustedKeys in actions. They could have
been used as a way to check if some rogue party injects secretly keys.
But there is a problem: this solution stalls to easily. Old, compromised keys would
require to recreate every action

### new approach

Seen and trusted keys should be kept client side. Every key and content has four trust levels

-   1: explicitly trusted
-   2: transitively trusted (by explicitly trusted key)
-   3: unverified (even set to be trusted on server side)
-   4: no signatures/only broken signatures

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
-   peek: don't trigger freeze (only with update permission) (or via X-PEEK header)

Not implemented yet

-   prekey=key hash:encrypted sharedkey/key of private key : opens pw form to decrypt prekey, requires iteration parameter (only GET parameter)
-   iterations=key hash:encrypted sharedkey/key of private key : opens pw form to decrypt prekey (only GET parameter)

### Return Headers

Removed headers

-   X-ID: Id of content (removed as it can leak infos)
-   X-CONTENT-HASH: Content hash of content (removed as it can leak infos)

By design only one content is returned

-   X-TYPE: Type of content
-   X-IS-SIGNED: is verified
-   X-NONCE: nonce
-   X-KEY: encrypting key of private key (only if encrypted private key is returned)
-   X-HASH-ALGORITHMS: comma seperated hash algorithm list
-   X-GRAPHQL-PATH: path to secretgraph graphql interface

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

-   key_hash: 1 needed except for keys (autogenerated) and public contents, format algorithm:hash
-   key: special, required tag for PrivateKey. Contains encrypted shared secret
-   freeze: cannot change content after viewing/fetching (use of ContentAction group fetch/view), freeze will be transformed to immutable
-   immutable: cannot change content. Deletion only possible for manage permission
    -   to remove this flag manage_update permission is required and can only done via metadata update
    -   immutable does not prevent action updates (via metadata update)

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
-   auth (Content, Cluster) affects (Content, Cluster). For onetime auth token for authenticating thirdparty: Should be defined together with view
    -   for Content: ignores inherited id exclusion
    -   for Cluster: adhers inherited id exclusion
-   view (Content, Cluster) affects (Content, Cluster):
    -   for Content:
        -   fetch: autodelete content after viewing
            allowPeek: allow peeking at content (not triggering freeze or update readStatistic)
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
        -   states:like param, include only contents with state
        -   includeTypes: like param, include only contents with type
        -   excludeTypes: like param, exclude contents with type, default: \[\]
            allowPeek: allow peeking at content (not triggering freeze or update readStatistic)
-   delete (Content, Cluster):
    -   for Cluster:
        -   includeTags: like param, include only contents with tag
        -   excludeTags: like param, exclude contents with tag, default: \[\]
        -   states:like param, include only contents with state
        -   includeTypes: like param, include only contents with type
        -   excludeTypes: like param, exclude contents with type, default: \[\]
-   update (Content, Cluster) affects (Content, Cluster) (has default view and peek permission):
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
    -   requiredKeys: require keys with keyhashes within array for encryption
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

They are put away in the subnamespace secretgraph

-   updateOrCreateContent: what it says
-   updateOrCreateCluster: what it says, can create keys
-   updateMetadata: update metadata of content
-   pushContent: special operation for pushing encrypted or unencrypted content into system
-   regenerateFlexid: shuffles (flex)id of content or cluster. Useful if somethings should be hidden.
-   deleteContentOrCluster: mark cluster or content for deletion (in case of cluster also to children)
-   resetDeletionContentOrCluster: reset deletion mark
-   logoutUser: logout user if logged in, note this is special as users are not a requirement for secretgraph

## includeTypes and excludeTypes

includeTypes is stronger than excludeTypes, it disables excludeTypes

## Security concept

The idea is, that data can be stored on limited trustworthy servers.
Missing patches should ideally not affect the security
For this we have two defense mechanism

-   e2e Data encryption for preventing server leaks
-   with tokens (keys for servers) encrypted auth informations to prevent forgery by server and having an access control

Server side decryption is an alternative, less secure way to access data. It is required for reading the contents on plain websites without client (e.g. secretgraph.proxy).

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

## Documents

Global documents (actually contents) can be created via `sg_manage_document` and specify a file and optionally name and description
They are for imprints and are presented in the proxy component as footer links.

Some special behavior

-   document contents are children of the @system cluster
-   cluster attribute is always null if retrieved via graphql
-   `sg_manage_document` addresses the documents via name

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

## js cloneData

cloneData must be set to null after update/ whilenavigation to prevent strange effects

## hidden Actions

Actions can be hidden via manage, for preventing leaks:
get_cached_result\["Actions"\] should be used for user facing output and manipulation

## Limited API

This API contains only basic information and no informations like ids.
It is a fallback API in case a cluster is not allowed to be read.
The contents are limited to PublicKey types

## Action updates

-   via json variant of "delete" actions can be deleted
-   actions are identified either by their hash or id

## JS updating config

-   updateConfig doesn't persist state in browser, use saveConfig for this

## Content deletion

Content deletion should be done via normal deletion (e.g. delete) where a signal is sent.
Otherwise files are remaining and the usage is not correctly calculated

## Transfer

Transfer can only be started on contents with transfer references. They can only be specified at creation time for security reasons (otherwise it is possible to circumvent the rentention time).
Transfer contents are deleted when an unrecoverable error happens or the server returns 404
When a transfer succeeds, signature references are created in case the Publickey is on the server and visible, otherwise a link and a signature tag are created

## Pull / stream in

This is currently not implemented as it needs background workers and has many caveats

# FAQ

## Why not Haskell/Rust for the backend

I know that languages would maybe be better for the backend.
But I am not familar with both (I grew up with C++ and learned python later).
Haskell has also the disadvantage of giant stack. That make system updates very big.

But on the bright side: we have nuitka, so the mallus is neglectable.

Anyway: I am always interested in Clients in other languages.
If you have such a project, we can put it in the secretgraph namespace, if you like

## Why 3party decryption via private key

The shared key can change, so the safest assumption is that the key of the private key stays stable.
This way you invalidate the access by updating the encryption key of the private key.
The private key is not neccessary exposed to the user but there are some danger:
now you have a decryption key to the private key, that is very dangerous.

For this reason, you should prefer a client and post a public key

## Why two languages?

JS is not mature enough for web servers. It is a dependency hell with security holes.

## Why id for updates

-   fixes problem with lost updates, especially for hot files like config
-   but metadata can be changed seperately (removing/adding tags/references)

## Why RSA and how to support Ecdh later

Curently only RSA can encrypt arbitary data; in this case the shared key.
For ecdh the shared key must be encrypted with the derivated key of the shared key of an new generated private key and the known public key.
This needs some work and is not as proofen like RSA. There are also some concerns of weakened curves. So maybe later in case they support post quantum encryption.

Note: in js there is a speciality: you specify the hash algorithm while importing/generating a key
not while the operation

## how to optimize performance

By design decrypted contents are excluded from caching (optionally they can be included).
It is expected that secretgraph runs behind a reverse proxy which cares for caching (for optimal performance) or
the client (e.g. a browser) understands the cache directives.
By default the included nginx can be used (it has no cache activated).

The best way to have a good performance is to avoid serverside decryption (decrypt get parameter). And in case someone abuses it for e.g. DDOS, to set a ratelimit or disable it via a ratelimit of "0/s". The client is not affected (urls are parsed internally so the shown decrypt get parameter is neglectable).
Note: the decrypt parameter is required for some proxy stuff (serving media or other non text files) and transfers

## Share url

### Content:

link of content object joined with url. Get parameter token are added. The resulting url is usable in webbrowers.
Via X-GRAPHQL-PATH response header the path to the graphql interface can be found.

Optionally an item GET parameter can be added to provide a hint for the client

### Cluster:

graphql url. Get parameter token are added. If it should resolve to a specific cluster either use the tokens or add an extra get parameter hint item which must be parsed by clients

Note: the grapqhl view is modified in that way that the method for contents (X-GRAPHQL-PATH header) is also available if called directly

### Auth (Cluster/Content):

The item get parameter is mandatory.

# TODO

-   add way for normal users to login and then to register a cluster
-   finish auth flow
-   shareurl: cluster url ? token = ...
-   ActionConfigurator must prime the missing field values before using them in fields
    -   maybe add prime method for initialValues
-   improve documention of documents (imprint), show usage
-   key callbacks: url:contentid:token
-   editors starting with : for meta editors like galeries (real types cannot contain ":")
-   teach decryptObject transfer
-   tools initializeCluster need to adapt to new config layout
-   keys need more infos, like callback url, item and tokens
-   select certificates a private content is encrypted for
-   certificates for slot
-   PushedArticle
-   split keys in signing/encrypting
-   validationError: use params
-   trustedKeys logic (partly done):
    -   Needs much more work especially on gui side
    -   a better ActionDialog is neccessary
-   implement settings/config (partly done)
-   modernize ActionDialog, redesign, multi column? Move partly to shareDialog?
-   implement shareFn and ShareDialog, Config has a special ShareDialog (partly done)
-   test permissions
-   way to inject tokens (as user)
-   way to import private key in config
-   cleanup js structure, harmonize naming

# TODO later

-   use threading for cryptography operations (put in threadpool)
-   maybe: allow lock url to be used as a start_url (for apple devices)
-   translations, changing languages
-   time restrictions (time ranges, block e.g. requests from 1 to 3 at weekdays)
-   edge-serverside encryption
    -   custom components
    -   python proxy decryptor
    -   maybe: encrypt via python proxy (for e.g. push forms)
-   investigate if on_request_start of strawberry extensions can replace the django signal logic
    -   maybe async signals are then already possible, use them instead
-   use weakref finalizers to nuke bytes content
-   disallow non global ids? Would ease implementation
-   encrypt Config set with saveConfig/loaded with loadConfigSync via a static key
    -   via var
-   port to real filters
-   move to dataclasses and TypedDicts
    -   nearly complete needs testing and TypedDicts
-   config: create a virtual global merge of all configs to get every token
-   allow alternate cryptoalgorithms instead of aesgcm for tags (except ChaCha20Poly1305 and AESSIV no good alternatives, and both aren't supported in browser)
-   cleanup user
-   implement different net resource logic in frontend
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
-   add prekey form and calculate everything client side

# TODO far future

-   post quantum crypto (library support is very bad)
-   pull support, "stream in" of content
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
