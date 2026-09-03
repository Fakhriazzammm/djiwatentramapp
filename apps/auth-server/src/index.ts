import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { auth } from "./auth.js";

const app = new Hono();

// CORS — allow customer app domain with credentials
app.use(
  "/api/auth/*",
  cors({
    origin: ["https://djiwatentram.yumme.id", "https://merchandise.yumme.id", "https://b2b.yumme.id", "http://localhost:5173"],
    allowHeaders: ["Content-Type", "Authorization", "X-Visitor-Id", "X-Request-Id"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

// Better Auth handler
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

const PORT = parseInt(process.env.BETTER_AUTH_PORT || "3001");
console.log(`⚡ Auth server running on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
