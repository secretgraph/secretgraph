


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

# Why id for updates
- fixes problem with lost updates, especially for hot files like config


# TODO
* updateId in form
* prekey implement form
* simplify config url export (no private key anymore)
* implement form with send for Message
* if type=Message switch strings to Inbox, Send
* find out how Messages sent can be differed from messages received
* contents handler for bigger list of contents

* cleanup, document server side encryption and allow disabling it (maybe remove it completely at some point)
  * specifying key allows to encrypt keys/values server side if nonce is not set
* merge configuration client side in case of updates
* maybe: encrypt some content tags, like name


```` exclude not executed:
{'authorization': ['Q2x1c3Rlcjo3YjEzM2VlNy1jYjUzLTQ1YTAtOGM5OS1jZDVmMTg5NzdhNjk=:B53zc7ZHqvSPyI83yGfmY5wOPNwG3f/3wLGycyguWpg='], 'includeTags': ['uYjzc5QE05r63M+nSWcivMPxQg5BElbdJkb5ZeGVhXTzYZYLT530NMqiy7bgJOFn1W71W1kzGlX1cIIfSfp24w=='], 'excludeTags': ['state=public'], 'clusters': ['Q2x1c3Rlcjo3YjEzM2VlNy1jYjUzLTQ1YTAtOGM5OS1jZDVmMTg5NzdhNjk='], 'first': 30}
127.0.0.1 - - [30/Aug/2020 08:55:20] "POST /graphql HTTP/1.1" 200 -
{'includeTags': ['state=public'], 'excludeTags': [], 'clusters': ['Q2x1c3Rlcjo3YjEzM2VlNy1jYjUzLTQ1YTAtOGM5OS1jZDVmMTg5NzdhNjk='], 'first': 30}
````
