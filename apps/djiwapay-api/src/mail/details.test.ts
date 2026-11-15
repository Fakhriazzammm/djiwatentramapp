import {expect,test} from 'bun:test';
import {paymentDetails,validatedDetails} from './details';
test('reads product lines and every printed adjustment from the body',()=>{
 const d=paymentDetails('Merchant: Kedai Uji\nKopi 2 x Rp15.000 Rp30.000\nRoti Rp10.000\nSubtotal Rp40.000\nDiskon Rp5.000\nPPN Rp3.500\nBiaya layanan Rp1.000\nTotal Rp39.500');
 expect(d.description).toBe('Kedai Uji');expect(d.items).toHaveLength(2);expect(d.items[0]).toMatchObject({name:'Kopi',qty:2,unitPrice:15000,amount:30000});expect(d.charges.map(x=>x.amount)).toEqual([3500,1000]);expect(d.total).toBe(39500);
});
test('bank fields survive padding without inventing goods or tax',()=>{
 const d=paymentDetails('Penyedia Jasa\n\nGoPay Customer\nNominal Top-up\nRp41.000\nBiaya Transaksi\nRp1.200\nTotal Transaksi\nRp42.200');
 expect(d.description).toBe('GoPay Customer');expect(d.items).toEqual([]);expect(d.charges[0].amount).toBe(1200);expect(d.total).toBe(42200);expect(d.subtotal).toBeNull();
});
test('rejects model-invented item names and taxes',()=>{
 const d=validatedDetails({items:[{name:'Pizza',amount:90000}],charges:[{label:'Pajak',amount:10000}]},'Pembayaran ke Kedai Rp25.000 berhasil');
 expect(d.items).toEqual([]);expect(d.charges).toEqual([]);
});
