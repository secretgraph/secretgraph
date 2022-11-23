declare var __DEV__: any

const dev = typeof __DEV__ != 'undefined' && __DEV__

const cacheName = 'secretgraph_v1'

const manifest_path = './manifest.json'
const externals = ['/favicon.ico', manifest_path, '/client/']

async function grab_assets(
    cache: RequestInit['cache'] = undefined
): Promise<string[]> {
    const resp = await fetch(manifest_path, { cache })
    if (resp.ok) {
        const assets: string[] = Object.values(await resp.json())
        for (const ext of externals) {
            if (!assets.includes(ext)) {
                assets.push(ext)
            }
        }
        return assets
    }
    return externals
}
async function installSW() {
    const [precachedAssets, cache] = await Promise.all([
        grab_assets(),
        caches.open(cacheName),
    ])
    if (dev) {
        console.log('Cache assets:', precachedAssets)
    }
    await cache.addAll(
        precachedAssets.map(
            (url) =>
                new Request(url.replace('webpack_bundles/', ''), {
                    credentials: 'omit',
                    mode: 'no-cors',
                })
        )
    )
}

self.addEventListener('install', (event: ExtendableEvent) => {
    event.waitUntil(installSW())
})

async function interceptFetch(event: FetchEvent): Promise<Response> {
    let response = undefined
    if (event.request.method == 'GET' || event.request.method == 'HEAD') {
        if (
            event.request.url.includes('/static/') ||
            event.request.url.endsWith('/client/')
        ) {
            const cache = await caches.open(cacheName)
            response = await cache.match(event.request.url, {
                ignoreSearch: true,
            })
            if (response) {
                return response
            }
            if (
                event.request.url.endsWith('/client/') ||
                event.request.url.endsWith('/favicon.svg')
            ) {
                await cache.add(event.request)
                response = await cache.match(event.request, {
                    ignoreSearch: true,
                })
                if (response) {
                    return response
                } else {
                    console.debug(
                        'could not intercept 2nd try: ' + event.request.url
                    )
                }
            }
        } else {
            console.debug('could not intercept: ' + event.request.url)
        }
    }
    return fetch(event.request)
}

self.addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(interceptFetch(event))
})
