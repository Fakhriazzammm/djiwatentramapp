const fs = require('fs');
const path = 'a:/My-Startup/djiwatentramapp/apps/web/src/routes/menu.lazy.tsx';
const buf = fs.readFileSync(path);

console.log('File size:', buf.length);
console.log('First 10 bytes:', Array.from(buf.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' '));

const isUtf16 = buf[0] === 0xFF && buf[1] === 0xFE;
const mightBeUtf16 = buf[1] === 0x00 && buf[3] === 0x00;

let text;
if (isUtf16 || mightBeUtf16) {
  text = buf.toString('utf16le');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  fs.writeFileSync(path, text, 'utf8');
  console.log('Converted to UTF-8');
} else {
  text = buf.toString('utf8');
  console.log('Already UTF-8');
}
console.log('First 300 chars:', text.substring(0, 300));
