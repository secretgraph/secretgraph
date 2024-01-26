# Security


## iprestrict


When a ratelimit is set to iprestrict, a rule with the same name as the group is required.

Following keys are defined:

`secretgraph_graphql_mutations`: same as mutation ratelimit key, ignores pathes
`secretgraph_graphql_errors`: same as graphql errors key, ignores pathes
`secretgraph_serverside_decryption`: same as serverside decryption key, ignores pathes
`secretgraph_signature_and_key_retrieval`: ...
