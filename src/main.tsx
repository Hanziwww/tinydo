import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./globals.css";
import { useSettingsStore } from "./stores/settingsStore";

const theme = useSettingsStore.getState().theme;
document.documentElement.classList.toggle("dark", theme === "dark");

document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
