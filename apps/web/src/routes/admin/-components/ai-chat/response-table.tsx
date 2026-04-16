import React from "react";
import { TableIcon } from "lucide-react";
import type { ResponseTableData } from "./types";

export function ResponseTable({ table }: { table: ResponseTableData }) {
	return (
		<div className="mt-3 overflow-hidden rounded-xl border border-border bg-background shadow-sm max-w-full">
			{table.title && (
				<div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
					<TableIcon className="h-3.5 w-3.5 text-primary shrink-0" />
					<span className="font-semibold text-foreground text-xs truncate">{table.title}</span>
				</div>
			)}
			<div className="overflow-x-auto">
				<table className="w-full text-left text-[11px]">
					<thead>
						<tr className="border-b border-border bg-muted/30">
							{table.headers.map((h, i) => (
								<th key={i} className="px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap first:pl-3 last:pr-3">
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{table.rows.map((row, ri) => (
							<tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
								{row.map((cell, ci) => {
									const isNumeric = /^[\d.,\s Rp%+-]+$/.test(cell) && cell.trim().length > 0;
									return (
										<td key={ci} className={`px-3 py-1.5 whitespace-nowrap ${isNumeric ? "text-right font-medium tabular-nums" : ""} ${ci === 0 ? "font-medium text-foreground" : "text-foreground/80"}`}>
											{cell}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
					{table.footer && table.footer.length > 0 && (
						<tfoot>
							<tr className="border-t-2 border-border bg-muted/30 font-bold">
								{table.footer.map((cell, ci) => {
									const isNumeric = /^[\d.,\s Rp%+-]+$/.test(cell) && cell.trim().length > 0;
									return (
										<td key={ci} className={`px-3 py-2 whitespace-nowrap ${isNumeric ? "text-right tabular-nums" : ""} text-foreground`}>
											{cell}
										</td>
									);
								})}
							</tr>
						</tfoot>
					)}
				</table>
			</div>
		</div>
	);
}
