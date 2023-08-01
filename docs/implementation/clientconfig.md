# Client side Config

The heart piece of seetgraph clients are their config, it is self referencing and
can be used to decrypt the contents the user is eligible for.

Multiple clients can have multiple configs and their contentupdates can be synced.
The syncing works via slots, every config has a main slot assigned (the first slot), and secondary slots
New updates will be synced to all slots

Note: config specific settings like pw or lock url are never synced

Note: Currently there is no way to move items from one config to another
