import * as React from 'react'
import * as ReactDOM from 'react-dom'

document.addEventListener(
    'DOMContentLoaded',
    async function () {
        const MainPage = (
            await import(
                /* webpackMode: "lazy" */
                '@secretgraph/client/Client'
            )
        ).default
        await import(
            /* webpackMode: "lazy" */
            '@secretgraph/rdf-editors/editors'
        )
        let wrapper = document.getElementById('content-main')
        const defaultPath: string | undefined = wrapper
            ? wrapper.dataset.graphqlPath
            : undefined

        ReactDOM.render(<MainPage defaultPath={defaultPath} />, wrapper)
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
    },
    false
)
/**
if ("serviceWorker" in navigator) {
  const registration = runtime.register();
}
*/