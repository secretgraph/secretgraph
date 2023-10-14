# Design Decisions

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

# Caveats

## js cloneData

cloneData must be set to null after update/ whilenavigation to prevent strange effects

## hidden Actions

Actions can be hidden via manage, for preventing leaks:
get_cached_result\["Actions"\] should be used for user facing output and manipulation

## Limited API

### classic

This API contains only basic information and no informations like content or cluster ids.
It is a fallback API in case a cluster is not allowed to be read.
The contents are limited to PublicKey types.

### Download id/links

In case only the download id is available (e.g. via link) another limited API is available:
either via X-KEYHASH GET parameter (ratelimited) or via ContentDownload typed ids with the downloadId (graphql)
The later is not subject of extra ratelimits

## Action updates

-   via json variant of "delete" actions can be deleted
-   actions are identified either by their hash or id

## JS updating config

-   updateConfig doesn't persist state in browser, use saveConfig for this

## Content deletion

Content deletion should be done via normal deletion (e.g. delete) where a signal is sent.
Otherwise files are remaining and the usage is not correctly calculated

## Transfer

Transfer can only be started on contents with transfer references. They can only be specified at creation time for security reasons (otherwise it is possible to circumvent the retention time).
Transfer contents are deleted when an unrecoverable error happens or the server returns 404
When a transfer succeeds, signature references are created in case the Publickey is on the server and visible, otherwise a link and a signature tag are created

The tag transfer_url is used for the url (only one). It must contain an GET parameter named item pointing to the content (global id).
The tag transfer_header can be used for headers. Multiple entries are valid

## Pull / stream in

This is currently not implemented as it needs background workers and has many caveats

Note: there is an reserved type External which can be morphed despite the normal fixed types

## Cleanup of actions

Actions which have stop defined and stop is in the past are autoremoved after some time

## Token hashing

Token hashing is slightly different from normal hashing as you could build a rainbow table for 256 bit aes keys.
Therefore token inputs are prefixed with the string `secretgraph`+18 random bytes, only the last 32 bytes are used for aes.
Building a rainbow table would need 1600 Pebibyte.

Note: in python there is no hashToken. it is done with a `hashToken((b"secretgraph", token), hashAlgorithm)`

## Net? Cluster? Contents? References?

Net is an alias for a user or system account. It contains resource tracking and limits.
Its visibility is limited to cluster admins and admins.
Clusters are assigned to a net. They consist of contents and are responsible for permissions
(Contents can have some limited permissions).
Permissions are defined by actions which are a token permission mapping. A special permission is manage. It allows if the right cluster groups attributes are set that admin like abilities are executed by the owner of the token
They include seeing hidden contents or even delete contents not owned by the user.
Content permissions are restricted to create subcontents according to a pattern, to update or to view.
Contents can link to each other (depending on permissions) via references. References can auto destroy the owner if the referenced object is deleted via the DeleteRecursive attribute.

## groups? NetGroups? ClusterGroups?

Netgroups are attached to the net and give permissions or work as marker
ClusterGroups are attached to a cluster and alter its behaviour

On clusters only ClusterGroups are visible (Cluster.groups), Users can manage (if allowed to via userSelectable) both types of groups
either via updateMetadata or an updateOrCreateCluster

To query net groups, use secretgraph.node with a composed id: `<net>:<primaryCluster flexid>` and apply base64 on it.
You get an NetNode and can query its groups.

Note: you need the manage permission of the primaryCluster or the admin permission `manage_user`

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
