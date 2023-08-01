# structure

It is currently a monorepo containing js and python parts

## django

-   secretgraph.server: server component for raw data. Has some views for non graphql
-   secretgraph.proxy: presents react part to user
-   secretgraph.user: Quota user, some views for editing user
-   secretgraph.settings: settings part
-   secretgraph.schema: merged schema
-   secretgraph.urls: urls
-   secretgraph.asgi: asgi entrypoint (should be used)
-   secretgraph.wsgi: wsgi entrypoint (legacy)
-   tests: tests

## python (without django)

-   secretgraph.tools: user facing tools
-   secretgraph.core
    -   constants: contains constants
    -   utils: misc utils without django requirement

## js part

-   assets: loader for js part
-   js-packages: js packages
-   webpack and npm related files
