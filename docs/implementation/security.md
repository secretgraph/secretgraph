# Security


## iprestrict


When a ratelimit is set to iprestrict, you can hook in with RuleRatelimitGroup matchers.

Note: the rule will not used anymore in the normal matching process

Following keys are defined:

`secretgraph_graphql_mutations`: same as mutation ratelimit key, ignores pathes
`secretgraph_graphql_errors`: same as graphql errors key, ignores pathes
`secretgraph_serverside_decryption`: same as serverside decryption key, ignores pathes
`secretgraph_signature_and_key_retrieval`: ...
