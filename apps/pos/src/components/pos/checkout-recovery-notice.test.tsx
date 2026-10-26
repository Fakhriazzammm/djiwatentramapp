import { expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutRecoveryNotice } from "./checkout-recovery-notice";

it("shows the original checkout and warns that recovery does not submit edited inputs", () => {
	const html = renderToStaticMarkup(<CheckoutRecoveryNotice customerName="Ayu" total={10000} busy={false} onRecover={() => {}} />);
	expect(html).toContain("Ayu");
	expect(html).toContain("10.000");
	expect(html).toContain("pesanan awal");
	expect(html).toContain("akan digantikan");
});

it("uses cashier-friendly recovery language without technical terms", () => {
	const html = renderToStaticMarkup(<CheckoutRecoveryNotice customerName="Ayu" total={10000} busy={false} onRecover={() => {}} />);
	expect(html).toContain("Pesanan sebelumnya belum selesai");
	expect(html).toContain("Status pesanan sebelumnya belum tampil");
	expect(html).not.toContain("Server");
	expect(html).not.toContain("draft");
});

it("offers one explicit recovery action and disables it while sending", () => {
	let calls = 0;
	const view = CheckoutRecoveryNotice({customerName:"Ayu",total:10000,busy:false,onRecover:()=>{calls++;}});
	const action = view.props.children[3];
	action.props.onClick();
	expect(calls).toBe(1);
	const html = renderToStaticMarkup(<CheckoutRecoveryNotice customerName="Ayu" total={10000} busy onRecover={() => {}} />);
	expect(html).toContain("disabled");
});
