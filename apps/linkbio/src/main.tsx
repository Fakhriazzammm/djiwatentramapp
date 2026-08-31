import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { installNumberInputBehavior } from "@yumipos/web-shared";
import { AppUpdatePrompt } from "./components/app-update-prompt";
import { checkForAppUpdate, startAppUpdatePolling } from "./lib/app-update";


installNumberInputBehavior();
startAppUpdatePolling();
if (typeof document !== "undefined") {
  let lastCheck = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < 30_000) return;
    lastCheck = Date.now();
    void checkForAppUpdate();
  });
}
const root = document.getElementById("root");
if (!root) throw new Error("Linkbio root element is missing");

createRoot(root).render(
  <StrictMode>
    <><App /><AppUpdatePrompt /></>
  </StrictMode>,
);
