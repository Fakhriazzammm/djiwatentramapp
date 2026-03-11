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
	signIn: {
		email: async (_data: any, _options?: any) => {
			// Stub implementation
			if (_options?.onSuccess) _options.onSuccess();
			return { data: { user: { id: "test-id" } }, error: null };
		},
		social: async (_data: any) => {
			// Stub implementation
			return { data: { user: { id: "test-id" } }, error: null };
		},
	},
};
