# TODO

-   automatize python query generation
-   implement UserSelectable in frontend (in progress)
-   editor for Personal Data (in progress)
-   verification workflow in tests
-   HashEntry: multiple action types for a hash cause multiple seperate actions, display it nicer
-   complete share
    -   add option to save new token in config (not auth)
-   teach decryptObject transfer
-   keys need more infos, like callback url, item and tokens
-   key callbacks: graphqlurl?item=baseCluster&token=... or contenturl?token= for pushable contents
-   PushedArticle
-   split keys in signing/encrypting
-   validationError: use params
-   trustedKeys logic (partly done):
    -   Needs much more work especially on gui side
    -   a better ActionDialog is neccessary
-   implement settings/config (partly done)
-   modernize ActionDialog, redesign, multi column? Move partly to shareDialog?
-   test permissions
-   way to inject tokens (as user)
-   way to import private key in config
-   cleanup js structure, harmonize naming

# TODO later

-   editors starting with : for meta editors like galeries (real types cannot contain ":")
-   allow token stubs, only containing description
-   select certificates a private content is encrypted for
-   cleanup utils/arguments.py
-   frontend: allow changing net
-   use threading for cryptography operations (put in threadpool)
-   maybe: allow lock url to be used as a start_url (for apple devices)
-   translations, changing languages
-   time restrictions (time ranges, block e.g. requests from 1 to 3 at weekdays)
-   edge-serverside encryption
    -   custom components
    -   python proxy decryptor
    -   maybe: encrypt via python proxy (for e.g. push forms)
-   use weakref finalizers to nuke bytes content
-   disallow non global ids? Would ease implementation
-   encrypt Config set with saveConfig/loaded with loadConfigSync via a static key
    -   via var
-   port to real filters
-   move to dataclasses and TypedDicts
    -   nearly complete needs testing and TypedDicts
-   config: create a virtual global merge of all configs to get every token
-   allow alternate cryptoalgorithms instead of aesgcm for tags (except ChaCha20Poly1305 and AESSIV no good alternatives, and both aren't supported in browser)
-   cleanup user
-   harmonize incl/exclFilter and allowedTags specs (maybe)
-   transform iter_decrypt_contents into QuerySet (maybe)
-   subscribe to config, watch changes
-   delete: limit amount?
-   metadata: limit amount of changed contents/clusters
-   implement form with send for Message
-   if type=Message switch strings to Inbox, Send
-   find way how Messages sent can be differed from messages received
-   add prekey form and calculate everything client side

# TODO far future

-   post quantum crypto (library support is very bad)
-   more async (needs better django support)
-   recovery:
    -   save a recovery token in remote identity provider (needs identity provider+ identity editor)
        -   can retrieve it via sms
        -   or identity verification (passport, e.g.)
-   moving / hiding by regenerating flexids
    1. list all providers
    2. issue an onetime update token for all of them and save it (with flexid relation)
    3. regenerate flexid / move content
    4. update providers via token
