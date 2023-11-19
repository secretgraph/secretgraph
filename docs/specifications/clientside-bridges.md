## Client side bridges

### What are client side briges

In Matrix there are bridges. That are extensisons which are installed on the server to translate between Matrix and other services. They
are mostly used for messengers, therefor the pushed informations will likely be messages

Client side briges in contrast just use edge systems like a trusted pc or even the same device

There are multiple models possible

-   bridge programs on untrusted pcs e.g. servers push the encrypted information into secretgraph, with client side briges translating them. This works with the type "External"
-   client side bridges do push the translated informations into secretgraph
-   for unencrypted services only: server side bridges encrypt and push the information into secretgraph

### Existing infrastructure

For building client side bridges, there is following infrastructure:

-   The opaque type "External"
-   The pull mutation which allows the secretgraph server to pull content itself. It is ratelimited
