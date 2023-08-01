# Security concept

The idea is, that data can be stored on limited trustworthy servers.
Missing patches should ideally not affect the security
For this we have two defense mechanism

-   e2e Data encryption for preventing server leaks
-   with tokens (keys for servers) encrypted auth informations to prevent forgery by server and having an access control

Server side decryption is an alternative, less secure way to access data. It is required for reading the contents on plain websites without client (e.g. secretgraph.proxy).
