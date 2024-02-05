# TODO

-   complete refactory of ts code
-   major refactory of python code to the new crypto system
-   goToNode document node change function
-   document how to add elements, cannot use goToNode here
-   editor for Personal Data (in progress)
-   HashEntry: multiple action types for a hash cause multiple seperate actions, display it nicer
-   complete share
    -   add option to save new token in config (not auth)
-   keys need more infos (done but not tested and validity not enforced)
    -   key callbacks: graphqlurl?item=baseCluster&token=... or contenturl?token= for pushable contents
-   PushedArticle (cached article)
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
-   language selector?

# TODO later

-   quantum safety (currently there is no stable implementation)
-   add bypass\_ property prefix to potential dangerous property prefixes
-   automatize python query generation
-   safeListedContents Subquery/ids which are no subject of safeguards introduced by fetch_contents, may introduce some performance overhead
-   document and enable pull and make Content optional (cluster id will cause content creation)
    -   needs safeguards against ddos missuse
-   add push_transfer endpoint for server side transfer message pushing (in case the client has no access)
-   split keys in signing/encrypting (supported but not in use yet)
-   editors starting with : for meta editors like galeries (real types cannot contain ":")
-   allow token stubs, only containing description
-   select certificates a private content is encrypted for
-   cleanup utils/arguments.py
-   frontend: allow changing net
-   use threading for cryptography operations (put in threadpool)
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
-   port to real filters?
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
