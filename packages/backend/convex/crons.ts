import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 07:05 Asia/Bangkok (00:05 UTC) setiap hari.
crons.cron(
	"daily inventory automation",
	"5 0 * * *",
	internal.inventory.runDailyInventoryAutomation,
	{}
);

export default crons;

