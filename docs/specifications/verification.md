# Verification

## Lemmas

1. Every json object is a tree
2. Every tree can be broken down in a deterministic one dimensional key value list (proof: DFS,BFS, key and value can be joined by a special char which is forbidden in key (e.g. "=")). Key = the path down to the value 8the leaf)
3. Every RDF graph can be transformed via a DFS/BFS in a tree (non-deterministic)
   3.1 Every RDF graph without anonymous nodes (e.g. complex array elements) can be even simpler transformed into a uniqe and stable hash. see below
4. Every one dimensional, deterministic array can be sorted and afterwards be used for a unique, stable hash

## Verification

Secretgraph proposes the concept of partial trees for verification as a full tree would require all key-value pairs, from which some tree parts are maybe not shared for privacy reasons.
Instead of certain keys and corresponding values are extracted. We may need to add a key named salt with a random value which is also part of the hash to prevent extracting additional information by trying.

To build the hash, we put the key value pairs in a one dimensional array, sort it, prefix it with the address and use it for the unique hash.

## Draft concept

![Verification Workflow](Verification_and_Wallet.png)

This is a stripped down variant of the draft:
ttps://gitlab.opencode.de/bmi/eidas2/-/issues/68

This is a stripped down international version which explains less trivials.

## Design decisions

### Why not simply prefixing the concatened result with the url?

Just prefixing the result will allow ambiguities as the query parameters can collide with the sorted key value pairs

## secretgraph implementation specific

Secretgraph uses argon2id for generating the hashes. It reuses the salt value to save the argon2 parameters. The salt is still part of the hash.
For checking that the salt is compatible it can be verified against the password b"secretgraph" (should be the same in unicode)

Because of the secretgraph hashing format: `<hash algorithm>:<actual hash>`, argon2 hashes are prefixed with `argon2:<actual argon2 hash>`

Domain:

For possible rejections based on the capabilities of a registry we prefix with a domain

Domains can be e.g. phonenumber, personal_info
