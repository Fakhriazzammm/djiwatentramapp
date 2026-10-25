import { fetchCustomerOrderById, type CustomerOrderReference } from "./customer-api";

export function loadCustomerReceiptOrder(
  id: string,
  references: CustomerOrderReference[],
  signal?: AbortSignal,
) {
  return fetchCustomerOrderById(id, references, signal);
}
