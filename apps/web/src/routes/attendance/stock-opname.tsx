import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/attendance/stock-opname")({
  validateSearch: (search: Record<string, unknown>) => ({
    role: (search.role as string) || "",
    shiftId: (search.shiftId as string) || "",
    shiftName: (search.shiftName as string) || "",
    userId: (search.userId as string) || "",
    userName: (search.userName as string) || "",
  }),
});
