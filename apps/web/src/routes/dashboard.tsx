import { createFileRoute } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import {
	Authenticated,
	AuthLoading,
	Unauthenticated,
	useQuery,
} from "convex/react";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import UserMenu from "@/components/user-menu";

export const Route = createFileRoute("/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	const [showSignIn, setShowSignIn] = useState(false);
	const privateData = useQuery(api.private_data.get);

	return (
		<>
			<Authenticated>
				<div>
					<h1>Dashboard</h1>
					<p>privateData: {privateData?.message}</p>
					<UserMenu />
				</div>
			</Authenticated>
			<Unauthenticated>
				{showSignIn ? (
					<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
				) : (
					<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
				)}
			</Unauthenticated>
			<AuthLoading>
				<div>Loading...</div>
			</AuthLoading>
		</>
	);
}
