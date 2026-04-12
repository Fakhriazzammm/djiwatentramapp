const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'apps', 'web', 'src', 'routes', 'admin', 'route.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Mobile Bottom nav (Regular)
const bottomNavRegex = /BOTTOM_NAV_ITEMS\.map\(\(item, index\) => \{([\s\S]*?)const isCenter = index === 2;/;
if (bottomNavRegex.test(content)) {
    content = content.replace(bottomNavRegex, (match, g1) => {
        return `BOTTOM_NAV_ITEMS.map((item, index) => {
						const { isAdmin, role } = useYumiAuth();
						const hasPermission = !item.permission || isAdmin || role?.permissions?.includes(item.permission);
						if (!hasPermission) return null;

						const isCenter = index === 2;`;
    });
    console.log('Patched Mobile Bottom Nav');
}

// 2. Quick Menu (BottomSheet)
const quickMenuRegex = /section\.items\.map\(\(item\) => \(([\s\S]*?)<Link([\s\S]*?)key=\{item\.to\}/;
if (quickMenuRegex.test(content)) {
    content = content.replace(quickMenuRegex, (match, g1, g2, g3) => {
        return `section.items.map((item) => {
														const { isAdmin, role } = useYumiAuth();
														const hasPermission = !item.permission || isAdmin || role?.permissions?.includes(item.permission);
														if (!hasPermission) return null;

														return (
															<Link
																className="flex flex-col items-center gap-2 rounded-xl bg-muted/50 p-3 transition-colors active:bg-muted"
																key={item.to}`;
    });
    console.log('Patched Quick Menu');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Script completed');
