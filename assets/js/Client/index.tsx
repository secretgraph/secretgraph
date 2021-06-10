import * as React from 'react'
import * as ReactDOM from 'react-dom'

document.addEventListener(
    'DOMContentLoaded',
    function () {
        const MainPage = require('./pages/index').default
        let wrapper = document.getElementById('content-main')
        const defaultPath: string | undefined = wrapper
            ? wrapper.dataset.graphqlPath
            : undefined

        ReactDOM.render(<MainPage defaultPath={defaultPath} />, wrapper, () => {
            if (module.hot) {
                module.hot.accept()
            }
        })
    },
    false
)
/**
if ("serviceWorker" in navigator) {
  const registration = runtime.register();
}
*/
