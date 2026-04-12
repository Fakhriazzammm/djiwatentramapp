const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'apps', 'web', 'src', 'routes', 'admin', 'route.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add hasPermission helper to AdminLayout
content = content.replace(
    'const { user: authUser, logout, isAdmin } = useYumiAuth();',
    'const { user: authUser, logout, isAdmin, role } = useYumiAuth();\n\n\tconst hasPermission = (permId?: string) => {\n\t\tif (isAdmin) return true;\n\t\tif (!permId) return true;\n\t\treturn role?.permissions?.includes(permId) || false;\n\t};'
);

// 2. Add Route Guard
content = content.replace(
    'const currentPageTitle = PAGE_TITLES[location.pathname] || "Admin";',
    'const currentPageTitle = PAGE_TITLES[location.pathname] || "Admin";\n\n\t// Route Guard\n\tuseEffect(() => {\n\t\tif (isAuthenticated && !isLoading) {\n\t\t\tconst currentPath = location.pathname;\n\t\t\tconst allItems = [...BOTTOM_NAV_ITEMS, ...QUICK_MENU_ITEMS];\n\t\t\tconst matchedItem = allItems.find(item => item.to && currentPath.startsWith(item.to));\n\t\t\tif (matchedItem?.permission && !hasPermission(matchedItem.permission)) {\n\t\t\t\ttoast.error("Anda tidak memiliki akses ke halaman ini.");\n\t\t\t\tnavigate({ to: "/admin" });\n\t\t\t}\n\t\t}\n\t}, [location.pathname, isAuthenticated, isLoading, role]);'
);

// 3. Update NavLink components to handle permissions
const desktopNavLinkOld = 'function DesktopNavLink({\n\tto,\n\ticon,\n\tlabel,\n\tactiveOptions,\n\tisCollapsed,\n\tpermission,\n}: {\n\tto: string;\n\ticon: React.ReactNode;\n\tlabel: string;\n\tactiveOptions?: { exact?: boolean };\n\tisCollapsed: boolean;\n\tpermission?: string;\n}) {\n\treturn (';

const desktopNavLinkNew = 'function DesktopNavLink({\n\tto,\n\ticon,\n\tlabel,\n\tactiveOptions,\n\tisCollapsed,\n\tpermission,\n}: {\n\tto: string;\n\ticon: React.ReactNode;\n\tlabel: string;\n\tactiveOptions?: { exact?: boolean };\n\tisCollapsed: boolean;\n\tpermission?: string;\n}) {\n\tconst { isAdmin, role } = useYumiAuth();\n\tconst hasPermission = !permission || isAdmin || role?.permissions?.includes(permission);\n\n\tif (!hasPermission) return null;\n\n\treturn (';

content = content.replace(desktopNavLinkOld, desktopNavLinkNew);

// 4. Update DesktopSubNavLink
const desktopSubNavLinkOld = 'function DesktopSubNavLink({\n\tto,\n\ticon,\n\tlabel,\n\tactiveOptions,\n\tpermission,\n}: {\n\tto: string;\n\ticon: React.ReactNode;\n\tlabel: string;\n\tactiveOptions?: { exact?: boolean };\n\tpermission?: string;\n}) {\n\treturn (';

const desktopSubNavLinkNew = 'function DesktopSubNavLink({\n\tto,\n\ticon,\n\tlabel,\n\tactiveOptions,\n\tpermission,\n}: {\n\tto: string;\n\ticon: React.ReactNode;\n\tlabel: string;\n\tactiveOptions?: { exact?: boolean };\n\tpermission?: string;\n}) {\n\tconst { isAdmin, role } = useYumiAuth();\n\tconst hasPermission = !permission || isAdmin || role?.permissions?.includes(permission);\n\n\tif (!hasPermission) return null;\n\n\treturn (';

content = content.replace(desktopSubNavLinkOld, desktopSubNavLinkNew);

// 5. Update Bottom Nav rendering to check permissions
content = content.replace(
    'const isActive = item.exact',
    'const { isAdmin, role } = useYumiAuth();\n\t\t\t\t\t\tconst hasPermission = !item.permission || isAdmin || role?.permissions?.includes(item.permission);\n\t\t\t\t\t\tif (!hasPermission) return null;\n\t\t\t\t\t\tconst isActive = item.exact'
);

// 6. Update Sidebar rendering to pass permissions
// (Actually the metadata is already in the objects, I just need to pass them to the props)

// 7. Inject permission props into nav links in AdminLayout return
// Dashboard
content = content.replace(
    'label="Dasbor"\n\t\t\t\t\t\tto="/admin"\n\t\t\t\t\t/>',
    'label="Dasbor"\n\t\t\t\t\t\tto="/admin"\n\t\t\t\t\t\tpermission="analytics:view"\n\t\t\t\t\t/>'
);
// Pesanan
content = content.replace(
    'label="Pesanan"\n\t\t\t\t\t\tto="/admin/orders"\n\t\t\t\t\t/>',
    'label="Pesanan"\n\t\t\t\t\t\tto="/admin/orders"\n\t\t\t\t\t\tpermission="orders:view"\n\t\t\t\t\t/>'
);
// Produk
content = content.replace(
    'label="Produk"\n\t\t\t\t\t\tto="/admin/products"\n\t\t\t\t\t/>',
    'label="Produk"\n\t\t\t\t\t\tto="/admin/products"\n\t\t\t\t\t\tpermission="products:manage"\n\t\t\t\t\t/>'
);
// Resep
content = content.replace(
    'label="Resep"\n\t\t\t\t\t\tto="/admin/recipe"\n\t\t\t\t\t/>',
    'label="Resep"\n\t\t\t\t\t\tto="/admin/recipe"\n\t\t\t\t\t\tpermission="inventory:manage"\n\t\t\t\t\t/>'
);
// Inventaris
content = content.replace(
    'label="Inventaris"\n\t\t\t\t\t\tto="/admin/inventory"\n\t\t\t\t\t/>',
    'label="Inventaris"\n\t\t\t\t\t\tto="/admin/inventory"\n\t\t\t\t\t\tpermission="inventory:manage"\n\t\t\t\t\t/>'
);
// Booking
content = content.replace(
    'label="Booking"\n\t\t\t\t\t\tto="/admin/booking"\n\t\t\t\t\t/>',
    'label="Booking"\n\t\t\t\t\t\tto="/admin/booking"\n\t\t\t\t\t\tpermission="orders:view"\n\t\t\t\t\t/>'
);
// Dapur
content = content.replace(
    'label="Dapur"\n\t\t\t\t\t\tto="/admin/kitchen"\n\t\t\t\t\t/>',
    'label="Dapur"\n\t\t\t\t\t\tto="/admin/kitchen"\n\t\t\t\t\t\tpermission="kitchen:view"\n\t\t\t\t\t/>'
);
// Bar
content = content.replace(
    'label="Bar"\n\t\t\t\t\t\tto="/admin/bar"\n\t\t\t\t\t/>',
    'label="Bar"\n\t\t\t\t\t\tto="/admin/bar"\n\t\t\t\t\t\tpermission="kitchen:view"\n\t\t\t\t\t/>'
);
// Layanan
content = content.replace(
    'label="Layanan Customer"\n\t\t\t\t\t\tto="/admin/customer-service"\n\t\t\t\t\t/>',
    'label="Layanan Customer"\n\t\t\t\t\t\tto="/admin/customer-service"\n\t\t\t\t\t\tpermission="orders:view"\n\t\t\t\t\t/>'
);
// Tim
content = content.replace(
    'label="Tim Operasional"\n\t\t\t\t\t\tto="/admin/operational-team"\n\t\t\t\t\t/>',
    'label="Tim Operasional"\n\t\t\t\t\t\tto="/admin/operational-team"\n\t\t\t\t\t\tpermission="users:manage"\n\t\t\t\t\t/>'
);
// Finance Overview
content = content.replace(
    'label="Overview"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/finance"\n\t\t\t\t\t\t\t\t\t\t\t/>',
    'label="Overview"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/finance"\n\t\t\t\t\t\t\t\t\t\t\t\tpermission="finance:view"\n\t\t\t\t\t\t\t\t\t\t\t/>'
);
// Transaksi
content = content.replace(
    'label="Transaksi"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/finance/transactions"\n\t\t\t\t\t\t\t\t\t\t\t/>',
    'label="Transaksi"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/finance/transactions"\n\t\t\t\t\t\t\t\t\t\t\t\tpermission="finance:view"\n\t\t\t\t\t\t\t\t\t\t\t/>'
);
// Laporan
content = content.replace(
    'label="Laporan"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/finance/reports"\n\t\t\t\t\t\t\t\t\t\t\t/>',
    'label="Laporan"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/finance/reports"\n\t\t\t\t\t\t\t\t\t\t\t\tpermission="finance:view"\n\t\t\t\t\t\t\t\t\t\t\t/>'
);
// Laporan Shift
content = content.replace(
    'label="Laporan Shift"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/finance/shift-reports"\n\t\t\t\t\t\t\t\t\t\t\t/>',
    'label="Laporan Shift"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/finance/shift-reports"\n\t\t\t\t\t\t\t\t\t\t\t\tpermission="finance:view"\n\t\t\t\t\t\t\t\t\t\t\t/>'
);
// HPP
content = content.replace(
    'label="HPP Kalkulator"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/hpp-calculator"\n\t\t\t\t\t\t\t\t\t\t\t/>',
    'label="HPP Kalkulator"\n\t\t\t\t\t\t\t\t\t\t\t\tto="/admin/hpp-calculator"\n\t\t\t\t\t\t\t\t\t\t\t\tpermission="finance:view"\n\t\t\t\t\t\t\t\t\t\t\t/>'
);
// Promosi
content = content.replace(
    'label="Promosi"\n\t\t\t\t\t\tto="/admin/discounts"\n\t\t\t\t\t/>',
    'label="Promosi"\n\t\t\t\t\t\tto="/admin/discounts"\n\t\t\t\t\t\tpermission="products:manage"\n\t\t\t\t\t/>'
);
// Pengaturan
content = content.replace(
    'label="Pengaturan"\n\t\t\t\t\t\tto="/admin/settings"\n\t\t\t\t\t/>',
    'label="Pengaturan"\n\t\t\t\t\t\tto="/admin/settings"\n\t\t\t\t\t\tpermission="settings:manage"\n\t\t\t\t\t/>'
);

// Add toast and useYumiAuth imports if missing in components
// (They are already at top level)

fs.writeFileSync(filePath, content, 'utf8');
console.log('Script completed');
