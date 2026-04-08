import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function toBase64(bytes: ArrayBuffer): string {
	const arr = new Uint8Array(bytes);
	let binary = "";
	for (let i = 0; i < arr.length; i++) {
		binary += String.fromCharCode(arr[i]);
	}
	return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
	const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(normalized);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

function extractSvixV1Signatures(headerValue: string): string[] {
	return headerValue
		.split(" ")
		.map((item) => item.trim())
		.filter(Boolean)
		.flatMap((item) => {
			const [version, signature] = item.split(",");
			if (version === "v1" && signature) return [signature];
			return [];
		});
}

function extractBearerToken(authHeader: string | null): string | null {
	if (!authHeader) return null;
	const [scheme, token] = authHeader.split(" ");
	if (!scheme || !token) return null;
	if (scheme.toLowerCase() !== "bearer") return null;
	return token.trim();
}

function timingSafeMatch(expected: string, candidate: string | null): boolean {
	if (!candidate) return false;
	return timingSafeEqual(expected, candidate);
}

async function verifyResendSignature(params: {
	payload: string;
	svixId: string;
	svixTimestamp: string;
	svixSignature: string;
	signingSecret: string;
}) {
	const timestamp = Number(params.svixTimestamp);
	if (!Number.isFinite(timestamp)) {
		return { valid: false, reason: "Timestamp tidak valid" };
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
		return { valid: false, reason: "Signature timestamp expired" };
	}

	const encodedSecret = params.signingSecret.startsWith("whsec_")
		? params.signingSecret.slice("whsec_".length)
		: params.signingSecret;
	const keyBytes = fromBase64(encodedSecret);

	const signedContent = `${params.svixId}.${params.svixTimestamp}.${params.payload}`;
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const digest = await crypto.subtle.sign(
		"HMAC",
		cryptoKey,
		new TextEncoder().encode(signedContent)
	);
	const computedSignature = toBase64(digest);
	const incomingSignatures = extractSvixV1Signatures(params.svixSignature);

	const matched = incomingSignatures.some((signature) =>
		timingSafeEqual(signature, computedSignature)
	);
	if (!matched) {
		return { valid: false, reason: "Signature mismatch" };
	}

	return { valid: true };
}

const resendWebhook = httpAction(async (ctx, request) => {
	const signingSecret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
	if (!signingSecret) {
		return new Response("Missing RESEND_WEBHOOK_SIGNING_SECRET", {
			status: 500,
		});
	}

	const svixId = request.headers.get("svix-id");
	const svixTimestamp = request.headers.get("svix-timestamp");
	const svixSignature = request.headers.get("svix-signature");
	if (!svixId || !svixTimestamp || !svixSignature) {
		return new Response("Missing Svix headers", { status: 400 });
	}

	const payloadText = await request.text();
	const verification = await verifyResendSignature({
		payload: payloadText,
		svixId,
		svixTimestamp,
		svixSignature,
		signingSecret,
	});

	if (!verification.valid) {
		return new Response(verification.reason ?? "Invalid signature", {
			status: 401,
		});
	}

	let payload: any;
	try {
		payload = JSON.parse(payloadText);
	} catch {
		return new Response("Invalid JSON payload", { status: 400 });
	}

	const eventType = payload?.type || payload?.event || "unknown";
	const data = payload?.data ?? {};
	const emailId = data?.email_id || data?.id || undefined;
	const createdAt = data?.created_at ? Date.parse(data.created_at) : undefined;

	await ctx.runMutation(internal.resendWebhook.logEvent, {
		eventType,
		emailId,
		webhookId: payload?.webhook_id || undefined,
		createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
		signatureValid: true,
		payload,
	});

	return new Response("ok", { status: 200 });
});

const mayarWebhook = httpAction(async (ctx, request) => {
	const webhookToken =
		process.env.MAYAR_WEBHOOK_TOKEN || process.env.VITE_MAYAR_WEBHOOK_TOKEN;

	if (webhookToken) {
		const url = new URL(request.url);
		const tokenFromHeader =
			request.headers.get("x-webhook-token") ||
			request.headers.get("x-mayar-webhook-token") ||
			request.headers.get("x-callback-token") ||
			extractBearerToken(request.headers.get("authorization"));
		const tokenFromQuery = url.searchParams.get("token");
		const incomingToken = tokenFromHeader || tokenFromQuery;

		if (!timingSafeMatch(webhookToken, incomingToken)) {
			return new Response("Unauthorized webhook", { status: 401 });
		}
	}

	let payload: {
		event?: string;
		type?: string;
		data?: {
			id?: string;
			transactionId?: string;
			transactionStatus?: string;
			status?: string;
			url?: string;
			link?: string;
			updatedAt?: string;
			paidAt?: string;
		};
	};
	try {
		payload = await request.json();
	} catch {
		return new Response("Invalid JSON payload", { status: 400 });
	}

	const eventName = (payload.event || payload.type || "").toLowerCase();
	const transactionStatus = String(
		payload.data?.transactionStatus || payload.data?.status || ""
	).toLowerCase();
	const invoiceId = payload.data?.transactionId || payload.data?.id;
	if (!invoiceId) {
		return new Response("Ignored: missing invoice identifier", { status: 200 });
	}

	const looksPaid =
		eventName.includes("payment.received") ||
		transactionStatus.includes("paid") ||
		transactionStatus.includes("success");
	const looksExpired = transactionStatus.includes("expired");
	const looksCancelled = transactionStatus.includes("cancel");
	const gatewayStatus = looksPaid
		? "paid"
		: looksExpired
			? "expired"
			: looksCancelled
				? "cancelled"
				: "pending";
	const paidAt = looksPaid
		? payload.data?.paidAt
			? Date.parse(payload.data.paidAt)
			: payload.data?.updatedAt
				? Date.parse(payload.data.updatedAt)
				: Date.now()
		: undefined;

	await ctx.runMutation(internal.orders.updateOrderPaymentGatewayByInvoiceId, {
		invoiceId,
		paymentGateway: {
			provider: "mayar",
			invoiceId,
			transactionId: payload.data?.transactionId,
			invoiceUrl: payload.data?.link || payload.data?.url,
			status: gatewayStatus,
			paidAt: Number.isFinite(paidAt) ? paidAt : undefined,
		},
		paymentReceiptKind: looksPaid ? "gateway_paid" : undefined,
	});

	return new Response("ok", { status: 200 });
});

http.route({
	path: "/webhooks/resend",
	method: "POST",
	handler: resendWebhook,
});

http.route({
	path: "/webhooks/mayar",
	method: "POST",
	handler: mayarWebhook,
});

export default http;
