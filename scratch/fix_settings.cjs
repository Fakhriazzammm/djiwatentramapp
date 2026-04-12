const fs = require('fs');
const filePath = 'a:/My-Startup/djiwatentramapp/apps/web/src/routes/admin/settings.lazy.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix confirmConfig type with robust multiline regex
console.log('Starting regex replacements...');

const confirmConfigTypeRegex = /const \[confirmConfig, setConfirmConfig\] = useState<\{\s+variant\?\: "danger" \| "warning" \| "info";\s+\}>\(\{/;
const confirmConfigTypeReplace = 'const [confirmConfig, setConfirmConfig] = useState<{\n\t\tisOpen: boolean;\n\t\ttitle: string;\n\t\tmessage: string;\n\t\tonConfirm: () => void;\n\t\tvariant?: "danger" | "warning" | "info";\n\t}>({';

if (confirmConfigTypeRegex.test(content)) {
    content = content.replace(confirmConfigTypeRegex, confirmConfigTypeReplace);
    console.log('Fixed confirmConfig type using regex');
} else {
    console.log('Could not find confirmConfig block even with regex');
}

// Fix handleDeleteUser variant and other fields - more robust regex
const deleteUserRegex = /setConfirmConfig\(\{\s+isOpen\: true,\s+title\: "Hapus Pengguna",\s+message\: "Semua data transaksi tetap ada namun akun ini tidak bisa lagi dipakai. Lanjutkan\?",\s+onConfirm\: async \(\) => \{/;
const deleteUserReplace = 'setConfirmConfig({\n\t\t\t\tisOpen: true,\n\t\t\t\ttitle: "Hapus Pengguna",\n\t\t\t\tmessage: "Semua data transaksi tetap ada namun akun ini tidak bisa lagi dipakai. Lanjutkan?",\n\t\t\t\tvariant: "danger",\n\t\t\t\tonConfirm: async () => {';

if (deleteUserRegex.test(content)) {
    content = content.replace(deleteUserRegex, deleteUserReplace);
    console.log('Fixed handleDeleteUser config');
}

const deleteRoleRegex = /setConfirmConfig\(\{\s+isOpen\: true,\s+title\: "Hapus Role",\s+message\: "Role ini akan dihapus permanen. Pastikan tidak ada user yang memakai role ini. Lanjutkan\?",\s+onConfirm\: async \(\) => \{/;
const deleteRoleReplace = 'setConfirmConfig({\n\t\t\t\tisOpen: true,\n\t\t\t\ttitle: "Hapus Role",\n\t\t\t\tmessage: "Role ini akan dihapus permanen. Pastikan tidak ada user yang memakai role ini. Lanjutkan?",\n\t\t\t\tvariant: "danger",\n\t\t\t\tonConfirm: async () => {';

if (deleteRoleRegex.test(content)) {
    content = content.replace(deleteRoleRegex, deleteRoleReplace);
    console.log('Fixed handleDeleteRole config');
}

// AI Model casts are likely already done by previous script run, but double check
const aiMatchCount = (content.match(/value as string/g) || []).length;
console.log(`AI Model value casts found: ${aiMatchCount}`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating settings.lazy.tsx');
