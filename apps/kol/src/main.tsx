import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./kx.css";

// Admin KOL kini ada di admin.djiwatentram.web.id (dan manager.djiwatentram.web.id); halaman /admin lama dialihkan.
if (window.location.pathname.replace(/\/+$/, "") === "/admin") window.location.replace("https://admin.djiwatentram.web.id/admin/kol-visits");
else createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
