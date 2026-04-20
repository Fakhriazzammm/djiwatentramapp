import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import UserMenu from "@/components/user-menu";
import { useYumiAuth } from "@/hooks/useYumiAuth";

export const Route = createLazyFileRoute("/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	const [showSignIn, setShowSignIn] = useState(false);
	const { isAuthenticated } = useYumiAuth();
	const privateData = isAuthenticated
		? { message: "This is private" }
		: { message: "Not authenticated" };

	return (
		<>
			{isAuthenticated ? (
				<div>
					<h1>Dashboard</h1>
					<p>privateData: {privateData?.message}</p>
					<UserMenu />
				</div>
			) : (
				<>
					{showSignIn ? (
						<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
					) : (
						<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
					)}
				</>
			)}
		</>
	);
}
