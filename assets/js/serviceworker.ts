const cacheName = 'secretgraph_v1'

const manifest_path = './manifest.json'

async function grab_assets(): Promise<string[]> {
    const resp = await fetch(manifest_path)
    if (resp.ok) {
        const assets: string[] = Object.values(await resp.json())
        if (!assets.includes(manifest_path)) {
            assets.push(manifest_path)
        }
        console.log('assets', assets)
        return assets
    }
    return [manifest_path]
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
