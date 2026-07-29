export function sanitizeContractHtml(html: string) {
	if (typeof window === "undefined") return html;
	const template = document.createElement("template");
	template.innerHTML = html;
	const forbidden = template.content.querySelectorAll("script, iframe, object, embed, link, meta");
	for (const node of Array.from(forbidden)) node.remove();
	const all = template.content.querySelectorAll("*");
	for (const element of Array.from(all)) {
		for (const attr of Array.from(element.attributes)) {
			const name = attr.name.toLowerCase();
			const value = attr.value.toLowerCase();
			if (name.startsWith("on") || value.includes("javascript:")) {
				element.removeAttribute(attr.name);
			}
		}
	}
	return template.innerHTML;
}
