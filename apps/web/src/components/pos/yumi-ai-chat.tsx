import AIChatContainer from "../../routes/admin/-components/ai-chat/ai-chat-container";

interface YumiAIChatProps {
	onClose?: () => void;
}

export function YumiAIChat({ onClose }: YumiAIChatProps) {
	return <AIChatContainer mode="pos" onClose={onClose} />;
}
