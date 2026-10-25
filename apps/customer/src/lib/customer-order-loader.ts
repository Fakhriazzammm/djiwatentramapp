import { fetchGuestOrders, fetchMemberOrders, normalizeCustomerOrderReferences, type CustomerOrderReferenceInput } from "./customer-api";
import { mapCustomerOrder, type CustomerOrder } from "./customer-order";

export async function loadCustomerOrders(
  sourceId: string | null,
  guestReferences: ReadonlyArray<CustomerOrderReferenceInput>,
  signal?: AbortSignal,
): Promise<CustomerOrder[]> {
  const rows = sourceId
    ? await fetchMemberOrders(signal)
    : await fetchGuestOrders(normalizeCustomerOrderReferences(guestReferences), signal);
  return rows.map(mapCustomerOrder);
}
