import { createLazyFileRoute } from "@tanstack/react-router";
import { KolAnnouncementsPage } from "./-kol/kol-announcements";

export const Route = createLazyFileRoute("/admin/kol-announcements")({ component: KolAnnouncementsPage });
