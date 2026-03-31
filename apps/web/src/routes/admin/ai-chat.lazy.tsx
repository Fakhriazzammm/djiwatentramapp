import { createLazyFileRoute } from "@tanstack/react-router";
import AIChatContainer from "./-components/ai-chat/ai-chat-container";

export const Route = createLazyFileRoute("/admin/ai-chat")({
	component: () => <AIChatContainer mode="admin" />,
});
