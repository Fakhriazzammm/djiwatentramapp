import type { ImgHTMLAttributes } from "react";
import customerFoodOrdering from "../../assets/djiwa-icons/customer-food-ordering.webp";
import restaurantCafe from "../../assets/djiwa-icons/restaurant-cafe.webp";
import shoppingCartOrder from "../../assets/djiwa-icons/shopping-cart-order.webp";
import paymentWallet from "../../assets/djiwa-icons/payment-wallet.webp";
import orderReceipt from "../../assets/djiwa-icons/order-receipt.webp";
import orderTracking from "../../assets/djiwa-icons/order-tracking.webp";
import loyaltyPoints from "../../assets/djiwa-icons/loyalty-points.webp";
import promoVoucher from "../../assets/djiwa-icons/promo-voucher.webp";
import foodCustomization from "../../assets/djiwa-icons/food-customization.webp";
import orderUpsell from "../../assets/djiwa-icons/order-upsell-main-dish-drink.webp";
import cashierTerminal from "../../assets/djiwa-icons/cashier-terminal.webp";
import orderQueue from "../../assets/djiwa-icons/order-queue.webp";
import kitchenDisplay from "../../assets/djiwa-icons/kitchen-display.webp";
import inventoryStock from "../../assets/djiwa-icons/inventory-stock.webp";
import stockOpname from "../../assets/djiwa-icons/stock-opname.webp";
import shiftClosing from "../../assets/djiwa-icons/shift-closing.webp";
import salesReport from "../../assets/djiwa-icons/sales-report.webp";
import attendanceCheckIn from "../../assets/djiwa-icons/employee-attendance-check-in.webp";
import attendanceCheckOut from "../../assets/djiwa-icons/employee-attendance-check-out.webp";
import workSchedule from "../../assets/djiwa-icons/work-schedule.webp";
import payrollPayslip from "../../assets/djiwa-icons/payroll-payslip.webp";
import employeeProfile from "../../assets/djiwa-icons/employee-profile.webp";
import businessAiAssistant from "../../assets/djiwa-icons/business-ai-assistant.webp";
import dashboardOverview from "../../assets/djiwa-icons/dashboard-overview.webp";
import deliveryManagement from "../../assets/djiwa-icons/delivery-management.webp";
import suppliersPurchaseOrder from "../../assets/djiwa-icons/suppliers-purchase-order.webp";
import returnManagement from "../../assets/djiwa-icons/return-management.webp";
import notificationsAlerts from "../../assets/djiwa-icons/notifications-alerts.webp";

export const djiwa3DIconSources = {
  "customer-food-ordering": customerFoodOrdering,
  "restaurant-cafe": restaurantCafe,
  "shopping-cart-order": shoppingCartOrder,
  "payment-wallet": paymentWallet,
  "order-receipt": orderReceipt,
  "order-tracking": orderTracking,
  "loyalty-points": loyaltyPoints,
  "promo-voucher": promoVoucher,
  "food-customization": foodCustomization,
  "order-upsell-main-dish-drink": orderUpsell,
  "cashier-terminal": cashierTerminal,
  "order-queue": orderQueue,
  "kitchen-display": kitchenDisplay,
  "inventory-stock": inventoryStock,
  "stock-opname": stockOpname,
  "shift-closing": shiftClosing,
  "sales-report": salesReport,
  "employee-attendance-check-in": attendanceCheckIn,
  "employee-attendance-check-out": attendanceCheckOut,
  "work-schedule": workSchedule,
  "payroll-payslip": payrollPayslip,
  "employee-profile": employeeProfile,
  "business-ai-assistant": businessAiAssistant,
  "dashboard-overview": dashboardOverview,
  "delivery-management": deliveryManagement,
  "suppliers-purchase-order": suppliersPurchaseOrder,
  "return-management": returnManagement,
  "notifications-alerts": notificationsAlerts,
} as const;

export type Djiwa3DIconName = keyof typeof djiwa3DIconSources;
export type Djiwa3DIconSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<Djiwa3DIconSize, string> = {
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-28 w-28",
  xl: "h-40 w-40",
};

export type Djiwa3DIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  name: Djiwa3DIconName;
  size?: Djiwa3DIconSize;
  alt?: string;
};

export function Djiwa3DIcon({ name, size = "md", alt = "", className = "", ...props }: Djiwa3DIconProps) {
  return (
    <img
      {...props}
      src={djiwa3DIconSources[name]}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      loading="lazy"
      decoding="async"
      className={`${sizeClasses[size]} shrink-0 object-contain ${className}`.trim()}
    />
  );
}
