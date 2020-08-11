


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

* shared key decryption
* implement form with send for Message
* if type=Message switch strings to Inbox, Send
* find out how Messages sent can be differed from messages received
* contents handler for bigger list of contents

* cleanup, document server side encryption and allow disabling it (maybe remove it completely at some point)
  * specifying key allows to encrypt keys/values server side if nonce is not set
* merge configuration client side in case of updates
* maybe: encrypt some tags tags
