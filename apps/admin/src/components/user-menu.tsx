import { useNavigate } from "@tanstack/react-router";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useYumiAuth } from "@/hooks/useYumiAuth";

import { Button } from "./ui/button";

export default function UserMenu() {
	const navigate = useNavigate();
	const { user, logout } = useYumiAuth();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" />}>
				{user?.name}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>My Account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem>{user?.username}</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => {
							logout();
							navigate({
								to: "/dashboard",
							});
						}}
						variant="destructive"
					>
						Sign Out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
