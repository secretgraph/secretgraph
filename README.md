


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

* improve speed by resolving once for all contents, clusters auth informations (view), instead of while every operation
* settings content(s) for sharing configuration, maybe use info tag "config"
* maybe: encrypt some info tags
