import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
const KolAdminApp = lazy(() => import("./kol-admin"));
const isAdminRoute = window.location.pathname.replace(/\/+$/, "") === "/admin";
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Memuat workspace admin...</div>}>{isAdminRoute ? <KolAdminApp /> : <App />}</Suspense></StrictMode>);
