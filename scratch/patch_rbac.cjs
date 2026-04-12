const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'apps', 'web', 'src', 'routes', 'admin', 'route.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update BOTTOM_NAV_ITEMS
content = content.replace(
    'const BOTTOM_NAV_ITEMS = [',
    'const BOTTOM_NAV_ITEMS = [\n\t{ to: "/admin", icon: LayoutDashboard, label: "Dasbor", exact: true, permission: "analytics:view" },\n\t{ to: "/admin/orders", icon: ClipboardList, label: "Pesanan", permission: "orders:view" },'
);
// Remove the old lines 83 and 84
content = content.replace('\t{ to: "/admin", icon: LayoutDashboard, label: "Dasbor", exact: true },\n', '');
content = content.replace('\t{ to: "/admin/orders", icon: ClipboardList, label: "Pesanan" },\n', '');
// Update finance item in BOTTOM_NAV_ITEMS
content = content.replace(
    '{ to: "/admin/finance", icon: Wallet, label: "Keuangan" }',
    '{ to: "/admin/finance", icon: Wallet, label: "Keuangan", permission: "finance:view" }'
);

// 2. Update QUICK_MENU_SECTIONS (Simplified: just injecting permissions)
const items = [
    { label: '"Produk"', perm: '"products:manage"' },
    { label: '"Resep"', perm: '"inventory:manage"' },
    { label: '"Inventaris"', perm: '"inventory:manage"' },
    { label: '"Booking"', perm: '"orders:view"' },
    { label: '"Keuangan"', perm: '"finance:view"' },
    { label: '"Transaksi"', perm: '"finance:view"' },
    { label: '"Laporan"', perm: '"finance:view"' },
    { label: '"Laporan Shift"', perm: '"finance:view"' },
    { label: '"HPP"', perm: '"finance:view"' },
    { label: '"Dapur"', perm: '"kitchen:view"' },
    { label: '"Bar"', perm: '"kitchen:view"' },
    { label: '"Layanan"', perm: '"orders:view"' },
    { label: '"Tim Operasional"', perm: '"users:manage"' },
    { label: '"Promosi"', perm: '"products:manage"' },
    { label: '"Forecast"', perm: '"analytics:view"' },
    { label: '"Pengaturan"', perm: '"settings:manage"' },
];

items.forEach(item => {
    const target = `label: ${item.label} }`;
    const replacement = `label: ${item.label}, permission: ${item.perm} }`;
    content = content.replace(target, replacement);
});

// 3. Update component Props
content = content.replace(
    'label: string;\n\tactiveOptions?: { exact?: boolean };\n\tisCollapsed: boolean;',
    'label: string;\n\tactiveOptions?: { exact?: boolean };\n\tisCollapsed: boolean;\n\tpermission?: string;'
);
content = content.replace(
    'label: string;\n\tactiveOptions?: { exact?: boolean };',
    'label: string;\n\tactiveOptions?: { exact?: boolean };\n\tpermission?: string;'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Script completed');
