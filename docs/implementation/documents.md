# Documents

Global documents (actually contents) can be created via `sg_manage_document` and specify a file and optionally name and description.
They are for imprints and are presented in the proxy component as footer links of the proxy component (web view).

For extracting documents from graphql use the filter paremeters `clusters=["@system"], includeTypes=["File", "Text"]`.

What are they for:

it is actually for imprints and other legally required informations. Therefore they are available from normal web.

Some special behavior

-   document contents are children of the @system cluster
-   cluster attribute is always null if retrieved via graphql
-   `sg_manage_document` addresses the documents via name instead of id

## Create a document

```sh
# with file name
poetry run ./manage.py sg_manage_document <pathotodoc>

# with custom name
poetry run ./manage.py sg_manage_document --name <name> <pathotodoc>


# with description
poetry run ./manage.py sg_manage_document --description <description> <pathotodoc>
```

### Create a document in docker

Note: name is required here

```sh
# docker
 cat <pathotodoc> | docker exec <secretgraph container name> ./manage.py sg_manage_document --name <name> -


# docker compose and description
 cat <path to doc> | docker-compose exec -T secretgraph ./manage.py sg_manage_document --name <name> --description <foo> -

```
