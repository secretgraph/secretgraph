# Authentication workflow

Secretgraph has a strong authorization workflow for authorizing the user to 3party applications.

In contrast to OAUTH on a rogue server it is validated that client actually authorized the action.
This is done by user signatures of the challenge.

Here the workflow in detail:

3party -> Client: challenge (should be printable, utf8), requester: url which requested the auth
Client -> Server: auth action with requester, challenge, signatures (of challenge and requester), generates token authtoken
Client -> 3party: provide 3party url with authtoken and `item` GET parameter
3party -> Server: 3party queries data and verifies signatures, 3party should use requester for verifying the requester url

A signature is made from: `<requester><challenge>` and in format `<hashalgorithm>:<public key hash>:<signature in b64>`

The challenge should be timelimited e.g. 2 hours or 1 day. It may can contain an encrypted timestamp.
The challenge is technically not limitted but would be better to have only visible characters in utf8 because of input problems in case the user have to provide it himself

Note: the secretgraph hash functions include already the `<hashalgorithm>:`prefix`
