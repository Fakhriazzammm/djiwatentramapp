import { useCallback } from "react";

// Legacy bridge kept only to satisfy existing hook signatures during cleanup.
export function useLegacyBackend() {
	return null;
}

export function useQuery(_query: unknown, args?: unknown) {
	if (args === "skip") return undefined;
	return undefined as any;
}

export function useMutation<T>(_mutation: T): (args: any) => Promise<any> {
	return useCallback(async (_args: any): Promise<any> => {
		return Promise.reject(
			new Error(
				"Legacy fallback is disabled. This action must use Supabase implementation."
			)
		);
	}, []);
}

export function useAction<T>(_action: T): (args: any) => Promise<any> {
	return useCallback(async (_args: any): Promise<any> => {
		return Promise.reject(
			new Error(
				"Legacy fallback is disabled. This action must use Supabase implementation."
			)
		);
	}, []);
}
