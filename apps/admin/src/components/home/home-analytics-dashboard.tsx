import { HomeTodaysPulse } from "@/components/home/home-todays-pulse";
import { HomeRevenueChart } from "@/components/home/home-revenue-chart";
import { HomeOnDutyCrew } from "@/components/home/home-on-duty-crew";

export function HomeAnalyticsDashboard() {
	return (
		<div className="space-y-4">
			<HomeTodaysPulse />
			<HomeRevenueChart />
			<HomeOnDutyCrew />
		</div>
	);
}
