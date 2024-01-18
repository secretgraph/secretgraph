# About

Secretgraph is a platform for online identities.
You can think of it like a batch of encrypted bags of data.

Data is resolved via types and bags (called clusters) not pathes like in filesystems.

This design has the advantage of giving thirdparties fine granular access to data and stop worrying to forget blocking a path.

As an additional layer of security users can have multiple such clusters thus having multiple identities

## Use cases

-   Online shop: extract all user information from a link and have a backchannel
-   Storage: saving images in the cloud and sharing it with family members
-   blogging: blog entries can be pushed out in the plain web via Text contents on a as favourite marked cluster. For some private contents keys and tokens can be specified as GET parameters and the link shared to the target audience

*   more

# Differences between matrix protocol and secretgraph

In short: secretgraph is for storage and matrix for communication

In long: both can mostly emulate each other with performance/memory penalties for some operations

-   Matrix: room, secretgraph: cluster: in contrast to rooms of matrix, secretgraph provides clusters with unordered contents. Key-chains are not used only the direct link to a key. This makes long threads of comments may slower to load (not implemented yet and there is maybe a workaround by sharing the key) but offers a better direct access to single contents of different types
-   Matrix: event, secretgraph: content: matrix events are diffs, big files are transfered peer 2 peer, secretgraph content: a blob of data of a type. The storage is the secretgraph instance. Via transfers the ownership can be shifted. Contents are subject to quota specifications, via nets can the resource quota allocation be shifted
-   User: in Matrix users are neccessary, in secretgraph optional. The main emphasis is on clusters and nets (abstraction of user). Therefore secretgraph is more suitable for non-users like industrial machines
-   resources: secretgraph allows weaker clients (server-side decryption), but is slower than matrix (think more of an email server)
-   special use cases: secretgraph has some unique features: autodestruction of data, simple authentication
-   security: matrix uses cryptographic keys as access tokens, secretgraph seperate cryptographic keys and access tokens which strengthens against quantum computers and provides more privacy (as said, you can have multiple identities and they are more like throwaway identities)

# Installation

Note: make sure that you use linux fileendings. The shell scripts will fail in docker otherwise.

## Docker

```sh
docker-compose up -d
# or
podman-compose  up -d
# or extend from docker-compose.base.yml for most flexibility
# Note: you need to serve the static files and connect the unix sockets
```

Note: you should change the SECRET_KEY and ALLOWED_HOSTS via `docker-compose.override.yml`, .env or extending schemas

It is now ready of running behind reverse proxies.

### change port:

`env PORT=8001 docker-compose ...`
or use `.env` with `PORT=8001`
or local only: `PORT=127.0.0.1:8001`

### change volume

analog to change port:

`SG_VOLUME=<new path or volume name>`

set an volume in the compose override and use `SG_VOLUME=volume` in evironment to make an docker managed volume

### use postgres unix sockets

```yaml
services:
    secretgraph:
        volumes:
            - /var/run/postgresql:/var/run/postgresql
        environment:
            DB_ENGINE: 'django.db.backends.postgresql'
            DB_NAME: ...
            DB_USER: ...
            DB_PASSWORD: ...
            DB_HOST: ''
```

## Manually (production)

Requirements:

-   python3 environment
-   npm (and nodejs) (should be at least last lts)

```sh
# remove not used databases
# instead of hypercorn you can install any other asgi server
poetry install --only main -E server -E postgresql -E mysql
# when using hypercorn
pip install hypercorn[h3]
# or
# pip install --no-cache .[server,postgresql,mysql] hypercorn[h3]
npm install
npm run build
python ./manage.py collectstatic --noinput
# hypercorn or whatever
hypercorn secretgraph.asgi:application
```

## debug

```sh
poetry install
npm install
./tools/debugrun.py
```

## Reverse proxy

A reverse proxy must provide three things to work with secretgraph:

1. a reasonable big client body size (for uploading big files) or having it disabled (could be problematic in terms of security)
2. forwarding the real ip and scheme (note: change SCHEME_HEADER to '$http_x_forwarded_proto' in .env or in docker-compose override to '$$http_x_forwarded_proto')
3. compatibility with websockets (see nginx-docker.conf.template)

In case of csrf errors with docker check first the scheme header definitions. Often only http is detected but https is provided.

## Usage

### With user interface

Requirement:

-   secretgraph.proxy active (default)
-   client enabled (default with secretgraph.proxy active)

Go to `serveraddress` e.g. http://localhost:8000 and click in the right corner on `webclient`
You will get redirected to login.

If you don't have a config / config url for login yet, go to register.

If you get `provider url invalid` enter a secretgraph provider with enabled login or register capabilities.
By default you just have to login with a user (created via cmd (e.g. `./manage.py createsuperuser`) or via admin area)

# Server Settings

## direct

server settings can be done in the standard django way. The derivated settings should import `secretgraph.settings`

Special configuration keys:

-   `SECRETGRAPH_REQUIRE_USER`: require the binding of nets to user accounts (except admin created nets) (default: true)
-   `SECRETGRAPH_ADMINAREA`: enable the admin area, allow admin login (default: false)
-   `SECRETGRAPH_HEADLESS`: remove gui (secretgraph.proxy) (note: it doesn't remove the graphiql gui as it is a useful tool even headless) (default: false)
-   `SECRETGRAPH_USE_USER`: if a user is logged in, also use his net, default: True. Disable in case a net only logic is used and it is causing errors
-   `SECRETGRAPH_ALLOW_REGISTER`: boolean, default False:.True allows registering new accounts. In case of `SECRETGRAPH_REQUIRE_USER` is True, normal login is required and `SIGNUP_URL` is for `registerUrl` returned
-   `SECRETGRAPH_CACHE_DECRYPTED`: shall decrypted results be marked for caching (slightly insecure as decrypted results lay in the cache but maybe required for slow file backends). Only useful if server side decryption is required
-   `SECRETGRAPH_RATELIMITS`: required, set ratelimits for `GRAPHQL_MUTATIONS`, `GRAPHQL_ERRORS`, `ANONYMOUS_REGISTER`, `DECRYPT_SERVERSIDE`
    note: in case serverside decryption should be disabled set a ratelimit of "0/s" or (0, 1)

## Ratelimits in detail

-   `GRAPHQL_MUTATIONS`: secretgraph provides an extension to limit mutating requests on graphql. This extension is enabled by the default scheme. When using an custom other schema you have to include the extension or the functionality is disabled
-   `GRAPHQL_ERRORS`: secretgraph provides an extension to limit requests on graphql which cause errors. This extension is enabled by the default scheme. When using an custom other schema you have to include the extension or the functionality is disabled.
    `ANONYMOUS_REGISTER`: register a cluster without a user/net. When not disabling this functionality and make the server public you need abuse controls
    `DECRYPT_SERVERSIDE`:

## docker

### secretgraph

-   `REQUIRE_USER`: require the binding of nets to user accounts (except admin created nets) (default: true)
-   `ALLOW_REGISTER`: allow registering new users (default: false)
-   `ALLOWED_HOSTS`: listen to hosts (default localhost)
-   `TRUSTED_PROXIES`: set valid ip addresses (comma seperated) of reverse proxy, "all" for blind trust, "unix" for unix sockets (can be specified together with ip addresses). Used for retrieving client ip (default: unix)
-   `HEADLESS`: activates `SECRETGRAPH_HEADLESS` (remove gui) (default: false)
-   `NO_USERS`: removes user auth stuff, can only be enabled if `REQUIRE_USER` and `SECRETGRAPH_ADMINAREA` are off
-   `SECRETGRAPH_ADMINAREA`: enable the admin area, allow admin login
-   `CACHE_DECRYPTED`: activate `SECRETGRAPH_CACHE_DECRYPTED` in emergency for slow file backends and the requirement of proxy. Only useful if server side decryption is required.
-   `RATELIMIT_*` where as keys `GRAPHQL_MUTATIONS`, `GRAPHQL_ERRORS`, `ANONYMOUS_REGISTER`, `DECRYPT_SERVERSIDE` are defined: set ratelimits or remove the default with the special key: `none`
-   `DB_ENGINE`: db stuff
-   `DB_USER`: db stuff
-   `DB_PASSWORD`: db stuff
-   `DB_HOST`: db stuff
-   `DB_PORT`: db stuff

### nginx (docker-compose)

Only valid for the nginx template specified in this repo!. Note: you have to escape $ with another $

-   `SCHEME_HEADER`:
    -   `'$$scheme'` for automatic scheme detection
    -   `'https'`: for hardcoding the value
    -   `'$$http_x_forwarded_proto'`: or other header containing the protocol

### how to optimize performance

By design decrypted contents are excluded from caching (optionally they can be included).
It is expected that secretgraph runs behind a reverse proxy which cares for caching (for optimal performance) or
the client (e.g. a browser) understands the cache directives.
By default the included nginx can be used (it has no cache activated).

The best way to have a good performance is to avoid serverside decryption (decrypt get parameter). And in case someone abuses it for e.g. DDOS, to set a ratelimit or disable it via a ratelimit of "0/s". The client is not affected (urls are parsed internally so the shown decrypt get parameter is neglectable).
Note: the decrypt parameter is required for some proxy stuff (serving media or other non text files) and transfers

# Further links

-   [Details](./docs/README.md)
-   [Todo](./TODO.md)
