import * as React from "react";
import * as ReactDOM from "react-dom";
import MainPage from "./pages";
import runtime from "serviceworker-webpack-plugin/lib/runtime";

let wrapper = document.getElementById("content-main");

ReactDOM.render(<MainPage />, wrapper);

/**
if ("serviceWorker" in navigator) {
  const registration = runtime.register();
}
*/
