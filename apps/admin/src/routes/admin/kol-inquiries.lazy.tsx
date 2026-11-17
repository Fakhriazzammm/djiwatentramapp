import { createLazyFileRoute } from "@tanstack/react-router";
import { KolInquiriesPage } from "./-kol/kol-inquiries";

export const Route = createLazyFileRoute("/admin/kol-inquiries")({ component: KolInquiriesPage });
