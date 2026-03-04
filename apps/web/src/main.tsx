import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./index.css";

// Set up Convex client (optional - graceful fallback if URL not configured)
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// Set up Router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  context: {
    convex,
  },
});

// Register things for typesafety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      {convex ? (
        <ConvexProvider client={convex}>
          <RouterProvider router={router} />
        </ConvexProvider>
      ) : (
        <RouterProvider router={router} />
      )}
    </React.StrictMode>
  );
}
