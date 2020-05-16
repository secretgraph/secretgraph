import * as React from "react";
import * as ReactDOM from "react-dom";
import { updateServerPath } from "./environment";
import MainPage from "./pages/Main";
import runtime from "serviceworker-webpack-plugin/lib/runtime";

let wrapper = document.getElementById("content-main");

updateServerPath(wrapper?.dataset.serverPath);

ReactDOM.render(<MainPage />, wrapper);

/**
if ("serviceWorker" in navigator) {
  const registration = runtime.register();
}
*/
