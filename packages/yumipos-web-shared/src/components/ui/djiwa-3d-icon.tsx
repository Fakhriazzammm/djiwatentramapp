import type { ImgHTMLAttributes } from "react";
import customerFoodOrdering from "../../assets/djiwa-icons-v2/customer-food-ordering.webp";
import restaurantCafe from "../../assets/djiwa-icons-v2/restaurant-cafe.webp";
import shoppingCartOrder from "../../assets/djiwa-icons-v2/shopping-cart-order.webp";
import paymentWallet from "../../assets/djiwa-icons-v2/payment-wallet.webp";
import orderReceipt from "../../assets/djiwa-icons-v2/order-receipt.webp";
import orderTracking from "../../assets/djiwa-icons-v2/order-tracking.webp";
import loyaltyPoints from "../../assets/djiwa-icons-v2/loyalty-points.webp";
import promoVoucher from "../../assets/djiwa-icons-v2/promo-voucher.webp";
import foodCustomization from "../../assets/djiwa-icons-v2/food-customization.webp";
import orderUpsell from "../../assets/djiwa-icons-v2/order-upsell-main-dish-drink.webp";
import cashierTerminal from "../../assets/djiwa-icons-v2/cashier-terminal.webp";
import orderQueue from "../../assets/djiwa-icons-v2/order-queue.webp";
import kitchenDisplay from "../../assets/djiwa-icons-v2/kitchen-display.webp";
import inventoryStock from "../../assets/djiwa-icons-v2/inventory-stock.webp";
import stockOpname from "../../assets/djiwa-icons-v2/stock-opname.webp";
import shiftClosing from "../../assets/djiwa-icons-v2/shift-closing.webp";
import salesReport from "../../assets/djiwa-icons-v2/sales-report.webp";
import attendanceCheckIn from "../../assets/djiwa-icons-v2/employee-attendance-check-in.webp";
import attendanceCheckOut from "../../assets/djiwa-icons-v2/employee-attendance-check-out.webp";
import workSchedule from "../../assets/djiwa-icons-v2/work-schedule.webp";
import payrollPayslip from "../../assets/djiwa-icons-v2/payroll-payslip.webp";
import employeeProfile from "../../assets/djiwa-icons-v2/employee-profile.webp";
import businessAiAssistant from "../../assets/djiwa-icons-v2/business-ai-assistant.webp";
import dashboardOverview from "../../assets/djiwa-icons-v2/dashboard-overview.webp";
import deliveryManagement from "../../assets/djiwa-icons-v2/delivery-management.webp";
import suppliersPurchaseOrder from "../../assets/djiwa-icons-v2/suppliers-purchase-order.webp";
import returnManagement from "../../assets/djiwa-icons-v2/return-management.webp";
import notificationsAlerts from "../../assets/djiwa-icons-v2/notifications-alerts.webp";
import navigationHome from "../../assets/djiwa-icons-v2/navigation/home.webp";
import navigationOrder from "../../assets/djiwa-icons-v2/navigation/order.webp";
import navigationHistory from "../../assets/djiwa-icons-v2/navigation/history.webp";
import navigationWallet from "../../assets/djiwa-icons-v2/navigation/wallet.webp";
import navigationProfile from "../../assets/djiwa-icons-v2/navigation/profile.webp";

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
  "navigation-home": navigationHome,
  "navigation-order": navigationOrder,
  "navigation-history": navigationHistory,
  "navigation-wallet": navigationWallet,
  "navigation-profile": navigationProfile,
} as const;

export type Djiwa3DIconName = keyof typeof djiwa3DIconSources;
export type Djiwa3DIconSize = "micro" | "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<Djiwa3DIconSize, string> = {
  micro: "h-6 w-6",
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
