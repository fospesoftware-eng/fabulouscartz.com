import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { UIProvider } from "./context/UIContext";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/charts.css";
import "./styles/pages.css";
import "./styles/map.css";
import "./styles/surface.css";
import "./styles/marketplace.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <UIProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </UIProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
