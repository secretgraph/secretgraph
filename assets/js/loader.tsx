import '@secretgraph/rdf-editors/editors'

import MainPage from '@secretgraph/client/Client'
import { StrictMode } from 'react'
import * as ReactDOM from 'react-dom/client'

let wrapper = document.getElementById('secretgraph-webclient') as HTMLElement
const defaultPath: string | undefined = wrapper
    ? wrapper.dataset.graphqlPath
    : undefined
const homeUrl: string | undefined = wrapper
    ? wrapper.dataset.homeUrl
    : undefined
const root = ReactDOM.createRoot(wrapper, { identifierPrefix: 'webclient' })
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
/**
if ('serviceWorker' in navigator) {
    const registration = runtime.register()
} */
