import '@secretgraph/rdf-editors/editors'

import MainPage from '@secretgraph/client/Client'
import * as ReactDOM from 'react-dom'

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
/**
if ('serviceWorker' in navigator) {
    const registration = runtime.register()
} */
