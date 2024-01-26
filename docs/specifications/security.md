# Security concept

The idea is, that data can be stored on limited trustworthy servers.
Missing patches should ideally not affect the privacy. This is why we have these defense mechanism

-   e2e Data encryption for preventing server leaks
-   tokens are encrypted (the hash is matched for a candidate) and only shortly decrypted
-   tokens encrypt also the auth informations, so tampering with permissions is only possible with altering the source code or creating some creative hooks

Server side decryption is an alternative, less secure way to access data. It is required for reading the contents on plain websites without client (e.g. secretgraph.proxy).
