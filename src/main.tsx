import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./globals.css";
import { useSettingsStore } from "./stores/settingsStore";
import { isDesktop, isMobile } from "./lib/platform";

const theme = useSettingsStore.getState().theme;
document.documentElement.classList.toggle("dark", theme === "dark");

if (isDesktop()) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}
if (isMobile()) {
  document.body.classList.add("mobile-body");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
