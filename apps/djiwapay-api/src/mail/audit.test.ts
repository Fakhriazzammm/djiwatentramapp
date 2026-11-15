import { expect,test } from 'bun:test';
import { auditRow } from './audit';
import { RULES_VERSION } from './extract';
test('audit catches limit announcements already in the queue',()=>{
 const row={userId:'any-user',subject:'[PENTING] Limit Baru Kartu Jago!',amount:150000000,direction:'unknown',sure:false,at:new Date().toISOString(),rulesVersion:RULES_VERSION};
 expect(auditRow(row)).toContain('noise-subject');
 expect(auditRow({...row,subject:'Pembayaran Berhasil!',amount:25000,direction:'out',sure:true})).toEqual([]);
});
