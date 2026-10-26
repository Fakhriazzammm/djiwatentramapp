import { StrictMode } from "react"; import { createRoot } from "react-dom/client"; import { DjiwaPayApp } from "./app"; import "./index.css"; import "./djiwa-pay-topup.css"; import "@yumipos/djiwa-checkout-ui/styles.css"; import "./ppob-service-ui.css";
const root=document.getElementById("root"); if(root) createRoot(root).render(<StrictMode><DjiwaPayApp/></StrictMode>);
