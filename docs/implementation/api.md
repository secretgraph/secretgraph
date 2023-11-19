# API

## Permissions (cluster or content)

-   manage: can change and create clusters, full access like admin
-   create: can add or move contents to cluster TODO: should check permission of cluster it moves from
-   delete: can delete contents or clusters and contents (depending on scope)
-   update: update contents or clusters
-   peek: can view contents without triggering freeze
-   push: create subcontents via push
-   view: view contents and or clusters (depending on scope)
-   link: can add reference to content (all public without @system+most actions which allow viewing a content)
-   auth: one-time view with intent to signal auth event (triggered when selecting auth element in graphql)

## Groups

There are two types of groups:

-   Netgroups: they are attached to the user (net). Addressing a net works via its primary cluster
-   Clustergroups: they are attached to a cluster and can alter its behavior

Both can alter the behavior via properties

### Properties:

-   default: on cluster creation these groups are added by default except if groups are explicit specified
-   bypass_pull_ratelimit: bypass pull ratelimit when using cluster with this permission or having the net permission
-   allow_global_name: can register a global cluster name
-   allow_dangerous_actions: can create dangerous actions (for user, e.g. deleting own stuff, currently only storedUpdate is locked behind)
-   allow_featured: can feature or unfeature clusters (only global clusters can be featured)
-   allow_view: can view content or cluster without permission check (but has still no access to data if encrypted), can query Publickeys via contents, deleted contents are only visible with permission (Net)
-   allow_hidden: can see hidden contents (Net,Cluster), can set hidden attribute (Net,Cluster), hidden groups of clusters (Net). Net properties won't become visible as well not net attached
-   allow_hidden_net: nets become visible (Net)
-   allow_hidden_net_props: can see net properties except default (Net)
-   manage_deletion: can delete every content or cluster (Net)
-   manage_active: can can block and unblock nets (via Cluster ids)
-   manage_cluster_groups: can manage global groups of clusters, hidden groups of clusters become visible
-   manage_net_groups: can manage global groups of nets, hidden groups of nets become visible. Can see properties of netGroups- Can see properties of netGroups
-   manage_user: manage nets and can add net to user
-   manage_update: can view and update every content or cluster (but has still no access to data if encrypted)
-   auto_hide_local: clusters with a group with this property have their public contents auto hidden if they are not a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with allow_hidden permission)
-   auto_hide_local_update: clusters with a group with this property have their public contents auto hidden after an update if they are not a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with allow_hidden permission)
-   auto_hide_global: clusters with a group with this property have their public contents auto hidden if they are a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with allow_hidden permission)
-   auto_hide_global_update: clusters with a group with this property have their public contents auto hidden after an update if they are a assigned to a global cluster (keys are excluded) and hidden was not specified (only available with allow_hidden permission)

### Group attributes

-   hidden: not visible to users without allow_hidden permission
-   userSelectable: alter how users can interact with the groups. There also fuses (deselect only, select only) and an initial only selection
-   managed (only settings): settings definition of global group cannot be overwritten in runtime
-   injectedKeys (only Clustergroup)

### Topic groups

Cluster groups with prefix `topic_` in their name and which are not hidden can be queried via includeTopics/excludeTopics.
This is a replacement for the former deep querying of clusters (could select content attributes)

Hint: topics needn't to be removed they can also be hidden in case they should be reactivated

## Content States:

-   required: Only PublicKey, like trusted+required as encryption target
-   trusted: Only PublicKey, a trusted encryption target. At least one is required.
-   public: Unencrypted, can be read by everyone
-   protected: Encrypted, only visible with view permission (token)
-   draft: like protected + excempted from autohiding
-   sensitive: like protected + excluded by default, except especially requested. For sensitive stuff like medical data or NSFW

## Shortcut creation of keys

With keys argument a keypair can be created or a privatekey associated with a publickey
Specified references are distributed between privatekey and publickey.
key refs are assigned to privatekey, the rest to the public key-
The current maximum are 2 key-pairs.

## Special references

-   group "key": extra holds encryped shared key
-   group "signature": extra holds signature for public key
-   group "public_key": special, auto generated reference. Links private key with public key

## graphql api

### Authorization header

-   flexid/global flexid:token: Auth token (only if authorization is not specified) or via authorization attribute

## contents request api

### GET or header

WARNING:

when using the GET parameter make sure to properly encode the data.
As most data is base64 encoded there are sometimes + signs which can cause hard to debug problems
So make sure you use an encoder which properly escapes the problematic chars

Especially make sure to quote + which is probably the only problematic char of base64 in query context.
It is really a source of pain and long debug times.

GET Parameters

-   key=key hash:sharedkey (privatekey way) or key=content id:sharedkey (direct way) : decrypt on the fly with key as crypto key (or X-Key Header)
-   token=global content/cluster id:token: Auth token (or Authorization Header), (id=flexid)
-   key_hash=hash: retrieve keys with hash (or X-KEY-HASH Header)
-   item=global content/cluster id, (id=flexid), in use e.g. for verification
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
-   X-DOWNLOAD-ID: download id of content (can be used to download file and extract verifiers), part of the link
-   X-IS-SIGNED: is verified
-   X-NONCE: nonce
-   X-KEY: encrypting key of private key (only if encrypted private key is returned)
-   X-HASH-ALGORITHMS: comma seperated hash algorithm list
-   X-GRAPHQL-PATH: path to secretgraph graphql interface

## decryption for non-secretgraph users or if only the downloadId is known

Prequisite: you specified valid tokens (at least 1)
currently there are four ways:

-   via ContentDownload API (graphql, no extra ratelimit)
-   via X-KEY-HASH header (ratelimit!), key_hash GET parameter: you get a dict of shared keys and signatures matching the key_hash.
    The shared keys may have a link to the private key (only if permission)

    -   decrypt the shared key directly
    -   decrypt the shared key via private key

-   X-Key, key GET parameter: provide the key and get the decrypted result back (implements both decryption methods, direct and via private key)

why via private key:

Otherwise the shared key could not be changed. This is especially an issue for often updated contents

## hashing

ContentHash: domain:algorithm:hash

leave domain empty to have an global domain. Normally the type is the domain

Special domains: Key for keys

key Hashing: algorithm:hash

hash Algorithm in Constants can contain / to specify arguments (convention)

## default excludes

public (required, trusted, public) PublicKeys are auto excluded in case a query is made without cluster ids and no allow_hidden permission is given.
This applies only to the contents. The clusters query can freely check if types are available

The reason behind this quirk is to prevent snooping keys to deanonymize users.

By default also sensitive and draft contents are excluded. They can be reincluded by specifying filters.

They are not for naive searches and should be explicit requested.

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

## Share url

### Content:

link of content object joined with url. Get parameter token are added. The resulting url is usable in webbrowers.
Via X-GRAPHQL-PATH response header the path to the graphql interface can be found.

Optionally an item GET parameter can be added to provide a hint for the client

### Cluster:

graphql url. Get parameter token are added. If it should resolve to a specific cluster either use the tokens or add an extra get parameter hint item which must be parsed by clients

Note: the grapqhl view is modified in that way that the method for contents (X-GRAPHQL-PATH header) is also available if called directly

### System Cluster:

Can be updated via admin access (admin area or permission) or actions defined on it.

It is invisible for all access scopes except "view" or if the former condition is satisfied

### Auth (Cluster/Content):

The `item` GET parameter is mandatory.
