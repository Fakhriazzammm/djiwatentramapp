const fs = require('fs');
const filepath = 'a:/My-Startup/djiwatentramapp/apps/web/src/routes/admin/settings.lazy.tsx';
let lines = fs.readFileSync(filepath, 'utf8').split('\n');
console.log('Line 3624 before:', lines[3623]);
console.log('Line 4240 before:', lines[4239]);
lines.splice(3623, 617);
console.log('Line 3624 after splice (should be </div>):', lines[3623]);
fs.writeFileSync(filepath, lines.join('\n'));
console.log('Successfully removed corrupted block.');
