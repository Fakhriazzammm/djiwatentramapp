import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
	Beer,
	Cake,
	ChevronRight,
	Coffee,
	IceCream,
	Pizza,
	Utensils,
} from "lucide-react";

export const Route = createFileRoute("/")({
	component: LandingPage,
});

const iconMap: Record<string, React.ElementType> = {
	Coffee,
	Utensils,
	Pizza,
	Beer,
	Cake,
	IceCream,
};

function LandingPage() {
	const settings = useQuery(api.site_settings.getSettings);

	const IconComponent =
		(settings?.landingIcon && iconMap[settings.landingIcon]) || Coffee;

	return (
		<div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-background p-6">
			{/* Decorative Circles */}
			<div className="absolute top-[-10%] left-[-10%] h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
			<div className="absolute right-[-10%] bottom-[-10%] h-96 w-96 rounded-full bg-primary/5 blur-3xl" />

			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="z-10 space-y-8 text-center"
				initial={{ opacity: 0, y: 20 }}
				transition={{ duration: 0.8 }}
			>
				<div className="mb-6 flex justify-center">
					<div className="rounded-full border border-border bg-card p-6 shadow-xl">
						{settings?.logoUrl ? (
							<img
								alt="Logo"
								className="h-16 w-16 object-contain"
								height={64}
								src={settings.logoUrl}
								width={64}
							/>
						) : (
							<IconComponent className="h-16 w-16 text-primary" />
						)}
					</div>
				</div>

				<h1 className="font-bold text-5xl text-foreground tracking-tight md:text-7xl">
					{settings?.landingTitle || "TKM COFFEE"}
				</h1>
				<p className="mx-auto max-w-md font-light text-muted-foreground text-xl tracking-wide md:text-2xl">
					{settings?.landingDescription || "Pengalaman Kopi Premium"}
				</p>

				<Link
					className="inline-flex items-center gap-3 rounded-full bg-primary px-10 py-5 font-bold text-lg text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95"
					to="/menu"
				>
					{settings?.landingButtonText || "Pesan Disini"}{" "}
					<ChevronRight className="h-5 w-5" />
				</Link>
			</motion.div>

			<div className="absolute bottom-8 w-full text-center text-muted-foreground/40 text-xs">
				Ketuk untuk memulai pesanan
			</div>
		</div>
	);
}
