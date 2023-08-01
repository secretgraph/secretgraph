# Trusted Keys

## why not in actions anymore

There was an idea to save to save trustedKeys in actions. They could have
been used as a way to check if some rogue party injects secretly keys.
But there is a problem: this solution stalls to easily. Old, compromised keys would
require to recreate every action

## new approach

Seen and trusted keys should be kept client side. Every key and content has four trust levels

-   1: explicitly trusted
-   2: transitively trusted (by explicitly trusted key)
-   3: unverified (even set to be trusted on server side)
-   4: no signatures/only broken signatures
