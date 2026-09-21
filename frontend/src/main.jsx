import React from "react";
alert(import.meta.env.VITE_API_URL);
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { SettingsProvider } from "./context/SettingsContext";

console.log("API =", import.meta.env.VITE_API_URL);

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </BrowserRouter>
);