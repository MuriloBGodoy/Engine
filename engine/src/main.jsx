import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { ToastProvider } from "./components/ToastProvider";
import { RegionProvider } from "./hooks/RegionProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initObservability } from "./services/observability";
import { installPreloadRecovery } from "./services/preloadRecovery";
import "./index.css";
import "./services/i18n";
import "./services/i18n-billing";
import "./services/i18n-reviews";
import "./services/i18n-services-extra";
import "./services/i18n-garage-fixes";
import "./services/i18n-general-fixes";
import "./services/i18n-social-fixes";
import "./services/i18n-intl";
import "./services/languageChoice";

// Antes do render: erro que acontece na montagem também precisa ser visto.
initObservability();
installPreloadRecovery();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RegionProvider>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </RegionProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
