const fs = require('fs');
const filePath = 'a:/My-Startup/djiwatentramapp/apps/web/src/routes/admin/settings.lazy.tsx';
let content = fs.readFileSync(filePath, 'utf8');

console.log('Starting refactor replacements...');

// Fix handleStartEditUser
content = content.replace(/id: user\._id,\s+name: user\.name/g, '_id: user._id,\n\t\t\tname: user.name');

// Fix handleStartEditRole
content = content.replace(/id: role\._id,\s+name: role\.name/g, '_id: role._id,\n\t\t\tname: role.name');

// Fix handleSaveEditRole usage
content = content.replace(/id: editingRole\.id,/g, 'id: editingRole._id,');

// Fix any other editingRole.id or editingUser.id access if they exist
content = content.replace(/editingUser\.id/g, 'editingUser._id');

// Fix handleDeleteUser and handleDeleteRole variant insertion if not already done
if (content.includes('message: "Semua data transaksi tetap ada namun akun ini tidak bisa lagi dipakai. Lanjutkan?",') && !content.includes('variant: "danger",\n\t\t\t\tonConfirm: async () => {')) {
    content = content.replace('message: "Semua data transaksi tetap ada namun akun ini tidak bisa lagi dipakai. Lanjutkan?",', 'message: "Semua data transaksi tetap ada namun akun ini tidak bisa lagi dipakai. Lanjutkan?",\n\t\t\t\tvariant: "danger",');
}

if (content.includes('message: "Role ini akan dihapus permanen. Pastikan tidak ada user yang memakai role ini. Lanjutkan?",') && !content.includes('variant: "danger",\n\t\t\t\tonConfirm: async () => {')) {
    content = content.replace('message: "Role ini akan dihapus permanen. Pastikan tidak ada user yang memakai role ini. Lanjutkan?",', 'message: "Role ini akan dihapus permanen. Pastikan tidak ada user yang memakai role ini. Lanjutkan?",\n\t\t\t\tvariant: "danger",');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished refactoring IDs in settings.lazy.tsx');
