import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { installNumberInputBehavior } from "@yumipos/web-shared";


installNumberInputBehavior();
const root = document.getElementById("root");
if (!root) throw new Error("Linkbio root element is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
