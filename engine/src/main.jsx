import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { ToastProvider } from "./components/ToastProvider";
import { RegionProvider } from "./hooks/RegionProvider";
import { initObservability } from "./services/observability";
import "./index.css";
import "./services/i18n";
import "./services/i18n-billing";

// Antes do render: erro que acontece na montagem também precisa ser visto.
initObservability();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RegionProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </RegionProvider>
  </React.StrictMode>,
);
