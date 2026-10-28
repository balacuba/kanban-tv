import React from "react";
import { createRoot } from "react-dom/client";
import { WoLineDashboard } from "./dashboard/WoLineDashboard";
import { I18nProvider } from "./dashboard/i18n";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <WoLineDashboard />
    </I18nProvider>
  </React.StrictMode>
);
