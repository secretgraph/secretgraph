declare var __DEV__: any

const dev = typeof __DEV__ != 'undefined' && __DEV__

const cacheName = 'secretgraph_v1'
const install_cache_mode = 'no-cors'
const install_cache_cache = 'reload'

const manifest_path = './manifest.json'
const externals = ['/favicon.ico', manifest_path, '/client/']

async function grab_assets(
    cache: RequestInit['cache'] = undefined,
    mode: RequestInit['mode'] = undefined
): Promise<string[]> {
    const resp = await fetch(manifest_path, {
        cache,
        credentials: 'omit',
        mode,
    })
    if (resp.ok) {
        const assets: string[] = Object.values(await resp.json())
        for (const external of externals) {
            if (external && !assets.includes(external)) {
                assets.push(external)
            }
        }
        return assets
    }
    return externals
}
async function installSW() {
    const [precachedAssets, cache] = await Promise.all([
        grab_assets(install_cache_cache, install_cache_mode),
        caches.open(cacheName),
    ])
    if (dev) {
        console.log('Cache assets:', precachedAssets)
    }
    await Promise.allSettled(
        precachedAssets.map((url) =>
            cache.add(
                new Request(url.replace('webpack_bundles/', ''), {
                    credentials: 'omit',
                    mode: install_cache_mode,
                    cache: install_cache_cache,
                })
            )
        )
    )
}

self.addEventListener('install', (event: ExtendableEvent) => {
    event.waitUntil(installSW())
})

async function interceptFetch(event: FetchEvent): Promise<Response> {
    let response: undefined | Response = undefined
    if (event.request.method == 'GET' || event.request.method == 'HEAD') {
        const url = new URL(event.request.url)
        const cache = await caches.open(cacheName)
        // serving cached client here can lead to big problems
        if (url.pathname.startsWith('/static/')) {
            response = await cache.match(event.request.url)
            if (response) {
                return response
            }
        }
        let cacheResponse =
            url.pathname.startsWith('/static/') ||
            url.pathname.search(/\/client\/?$/) >= 0
        try {
            response = await fetch(event.request)
            if (
                !response.ok &&
                response.status >= 500 &&
                response.status < 600
            ) {
                cacheResponse = false
                // serving client from cache when no network is no problem
                const response2 = await cache.match(event.request.url)
                if (response2) {
                    response = response2
                }
            }
        } catch (error) {
            cacheResponse = false
            // serving client from cache when no network is no problem
            response = await cache.match(event.request.url)
            if (!response) {
                throw error
            }
        }
        // cache and static are cached
        if (cacheResponse && response.ok) {
            await cache.put(event.request, response.clone())
        }

        return response
    }
    return await fetch(event.request)
}

self.addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(interceptFetch(event))
})
