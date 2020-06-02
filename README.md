


# structure django

* constants: contains constants
* server: server component for raw data. Has some views for non graphql
* proxy: presents react part to user
* user: Quota user, some views for editing user

# further structure
* assets: Client react stuff
* tests: tests



# Why two languages?

- js is not mature enough for web servers. Dependency hell with security holes.


# TODO

* don't expose pw protected secrets in publicInfo
  * expose ways for login
  * tokens are stretched so that also a pw can be a token
* maybe: encrypt some info tags
