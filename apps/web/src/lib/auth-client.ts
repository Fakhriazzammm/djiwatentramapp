export const authClient = {
	signOut: async (_options: { fetchOptions: { onSuccess: () => void } }) => {
		// Stub implementation
	},
	signUp: {
		email: async (_data: any) => {
			// Stub implementation
			return { data: { user: { id: "test-id" } }, error: null };
		},
	},
};
