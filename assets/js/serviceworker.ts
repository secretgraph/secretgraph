const cacheName = 'secretgraph_v1'

const manifest_path = './manifest.json'
const externals = ['/favicon.ico', manifest_path]

async function grab_assets(): Promise<string[]> {
    const resp = await fetch(manifest_path)
    if (resp.ok) {
        const assets: string[] = Object.values(await resp.json()).map(
            (val: string) => val.replace('webpack_bundles/', '')
        )
        for (const ext of externals) {
            if (!assets.includes(ext)) {
                assets.push(ext)
            }
        }
        return assets
    }
    return externals
}

self.addEventListener('install', async (event: ExtendableEvent) => {
    const precachedAssets = await grab_assets()
    event.waitUntil(
        caches.open(cacheName).then((cache) => {
            return cache.addAll(precachedAssets)
        })
    )
})

self.addEventListener('fetch', async (event: FetchEvent) => {
    const url = new URL(event.request.url)
    const precachedAssets = await grab_assets()
    const isPrecachedRequest = precachedAssets.includes(url.pathname)

    if (isPrecachedRequest) {
        event.respondWith(
            caches.open(cacheName).then((cache) => {
                return cache.match(event.request.url) as Promise<Response>
            })
        )
    } else {
        // Go to the network
        return
    }
})
