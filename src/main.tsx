import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTheme } from "./state/theme";
import "./styles.css";

initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Корневой элемент приложения не найден");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
