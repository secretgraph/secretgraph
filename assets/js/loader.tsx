import '@secretgraph/rdf-editors/editors'

import MainPage from '@secretgraph/client/index'
import { StrictMode } from 'react'
import * as ReactDOM from 'react-dom/client'

function load() {
    let wrapper = document.getElementById(
        'secretgraph-webclient'
    ) as HTMLElement
    const defaultPath: string | undefined = wrapper.dataset.graphqlPath
    const homeUrl: string | undefined = wrapper.dataset.homeUrl
    const swUrl: string = wrapper.dataset.swUrl as string
    if ('serviceWorker' in navigator) {
        // Register a service worker hosted at the root of the
        // site using the default scope.
        navigator.serviceWorker
            .register(swUrl, {
                scope: '/',
            })
            .then(
                (registration) => {
                    if (registration.installing) {
                        console.log(
                            'Service worker registration succeeded:',
                            registration
                        )
                    } else if (registration.waiting) {
                        console.debug('Service worker installed')
                    } else if (registration.active) {
                        console.debug('Service worker active')
                    }
                },
                (error) => {
                    console.error(
                        `Service worker registration failed: ${error}`
                    )
                }
            )
    } else {
        console.warn('Service workers are not supported.')
    }

    const root = ReactDOM.createRoot(wrapper, {
        identifierPrefix: 'webclient',
    })
    root.render(
        <StrictMode>
            <MainPage defaultPath={defaultPath} homeUrl={homeUrl} />
        </StrictMode>
    )
    // doesn't work
    /**if (module.hot) {
        module.hot.accept(
            ['./pages/index', './editors/file', './editors/cluster'],
            () => {
                const MainPage = require('./pages/index').default
                ReactDOM.render(
                    <MainPage defaultPath={defaultPath} />,
                    wrapper
                )
            }
        )
    }*/
}
load()
