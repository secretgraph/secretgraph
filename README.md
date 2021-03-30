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
-   create: can add contents
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

## Special tags

-   "key_hash": 2 needed except for keys (1 needed)
-   "key": special, required tag for PrivateKey. Contains encrypted shared secret

## Operations

idea: unique operation names. It would be nice to have namespaces

-   updateOrCreateContent: what it says
-   updateOrCreateCluster: what it says, can create keys
-   updateMetadata: of content
-   pushContent: special operation for pushing encrypted or unencrypted content into system
-   regenerateFlexid: shuffles (flex)id of content or cluster. Useful if somethings should be hidden.
-   deleteContentOrCluster: mark cluster or content for deletion (in case of cluster also to children)
-   resetDeletionContentOrCluster: reset deletion mark

# FAQ

## Why two languages?

-   js is not mature enough for web servers. Dependency hell with security holes.

## Why id for updates

-   fixes problem with lost updates, especially for hot files like config

## Action updates

-   via value = "delete" or json variant of "delete" actions can be deleted
-   actions are identified either by their hash or id
    Other types are:
-   {"}

# TODO

-   maybe: own apollo context with multiple instances (config/base, active url)
-   subscribe to config, watch changes
-   delete: limit amount?
-   metadata: limit amount of changed contents/clusters
-   tags: limit amount tags
-   use serialized algo name for certificates/tokens?
-   test permissions
-   disable editing/prompt for keys if keys are missing
-   cleanup serverside encryption
    -   remove many "key" arguments
    -   document when it is possible to push unencrypted content
-   document permissions, specialize
-   implement hidden, for administrative hidding of contents
-   cleanup js structure, harmonize naming, modulize more
-   updateId in form
-   prekey implement form
-   simplify config url export (no private key anymore)
-   implement form with send for Message
-   if type=Message switch strings to Inbox, Send
-   find way how Messages sent can be differed from messages received
-   contents handler for bigger list of contents
