import * as React from 'react'
import * as ReactDOM from 'react-dom'
import MainPage from './pages'

document.addEventListener(
    'DOMContentLoaded',
    function () {
        let wrapper = document.getElementById('content-main')
        const defaultPath: string | undefined = wrapper
            ? wrapper.dataset.graphqlPath
            : undefined

        ReactDOM.render(<MainPage defaultPath={defaultPath} />, wrapper)
    },
    false
)
/**
if ("serviceWorker" in navigator) {
  const registration = runtime.register();
}
*/
