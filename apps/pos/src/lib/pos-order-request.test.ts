import { expect, it } from "bun:test";
import { doesNotThrow, throws } from "node:assert/strict";
import { getOrderRequestKey, clearOrderRequestKey, readPendingCheckoutRecovery } from "./pos-order-request";

it("does not turn a successful order into a failure when metadata cleanup is blocked", () => {
	doesNotThrow(() => clearOrderRequestKey({ removeItem: () => { throw new Error("Storage blocked"); } }));
});

it("retains a request across retries and rotates after durable queueing", () => {
	const values = new Map<string, string>();
	const storage = {getItem:(key:string)=>values.get(key) ?? null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
	const first = getOrderRequestKey("same items", storage);
	expect(getOrderRequestKey("same items", storage)).toBe(first);
	clearOrderRequestKey(storage);
	expect(getOrderRequestKey("same items", storage) !== first).toBe(true);
});

it("refuses a new identity when an unresolved request is edited", () => {
	let raw:string|null = null;
	const storage = {getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
	const original = getOrderRequestKey("A", storage);
	throws(() => getOrderRequestKey("B", storage), /sebelumnya|pulihkan/i);
	expect(getOrderRequestKey("A", storage)).toBe(original);
});

it("rotates the next identical order even when the previous key could not be removed", () => {
	let raw: string | null = null;
	const storage = {getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;},removeItem:()=>{throw new Error("blocked");}};
	const previous = getOrderRequestKey("identical", storage);
	clearOrderRequestKey(storage);
	expect(getOrderRequestKey("identical", storage) !== previous).toBe(true);
});

it("recovers the exact attempted checkout after edits and a reload", () => {
	let raw: string | null = null;
	const storage = {getItem:()=>raw,setItem:(_key:string,value:string)=>{raw=value;}};
	const attempt = {snapshot:{cartItems:[{productId:"tea",name:"Teh",price:10000,quantity:1}],customerInfo:{name:"Ayu",orderType:"dine_in",tableNumber:"",notes:"Tanpa es",isFreeRefill:false,isSubmitted:false},appliedVoucher:null,promoDiscountAmount:0,voucherDiscountAmount:0,activeDiscounts:[],taxPolicy:{taxEnabled:false,taxRate:0,serviceChargeRate:0}},finalAmount:10000,paymentMethod:"tunai",orderData:{cashReceived:20000,changeAmount:10000}};
	getOrderRequestKey(JSON.stringify(attempt), storage);
	throws(() => getOrderRequestKey(JSON.stringify({...attempt,finalAmount:20000}), storage));
	expect(readPendingCheckoutRecovery(storage)).toEqual(attempt);
});

it("ignores malformed recovery metadata instead of executing it", () => {
	for (const raw of ["{", "null", JSON.stringify({key:"old",fingerprint:"{}"})]) {
		expect(readPendingCheckoutRecovery({getItem:()=>raw})).toBe(null);
	}
});
