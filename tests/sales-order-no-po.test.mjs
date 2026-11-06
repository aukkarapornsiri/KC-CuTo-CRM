import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {validatePO} from '../src/sales-orders.mjs';
import {hasNoPO,purchaseOrderLabel} from '../src/sales-order-po.mjs';
import {salesOrderHTML} from '../src/sales-order-print.mjs';
import {amendmentDraft,amendmentPatch} from '../src/so-amendments.mjs';
test('explicit no PO clears stale metadata and preserves status through revisions and print',()=>{
 const p=validatePO({no_po:true,po_number:'OLD',po_date:'2099-01-01',po_file_key:'old/file',po_file_name:'old.pdf'});
 assert.equal(p.po_date,null);assert.equal(p.po_number,'');assert.equal(p.po_file_key,'');assert.ok(hasNoPO(p));assert.equal(purchaseOrderLabel(p),'ไม่มี PO');assert.equal(purchaseOrderLabel(p,'en'),'No PO');assert.equal(purchaseOrderLabel({po_number:'PO-1'}),'PO-1');
 const order={...p,items:[],subtotal:0,discount:0,total:0};assert.equal(amendmentPatch(amendmentDraft(order)).no_po,true);
 assert.ok(salesOrderHTML(order,'th').includes('ไม่มี PO'));assert.ok(salesOrderHTML(order,'en').includes('No PO'));
 assert.throws(()=>validatePO({no_po:false}),/PO_REQUIRED/);
});
test('database saves no PO explicitly, keeps normal validation, idempotency and atomic approval',async()=>{
 const db=new PGlite();try{
 await db.exec(fs.readFileSync('tests/sales-order-no-po-fixture.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261106033239_sales_order_explicit_no_po.sql','utf8'));
 const id='11111111-1111-4111-8111-111111111111';
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const q=async()=>{const r=await db.query("insert into quotations(customer_id,owner_id,status,code,customer_name,items,subtotal,discount,vat,total,currency) values($1,$1,'draft','SQ-QA','QA','[{\"name\":\"Item\",\"qty\":1,\"price\":100,\"total\":100}]',100,0,7,107,'THB') returning id",[id]);return r.rows[0].id;};
 const convert=async(quote,details={no_po:true},number='',date=null,file='',name='')=>(await db.query("select (private.crm_sales_order_create_with_details($1,$2,$3,$4,$5,null,'','{}',$6)).*",[quote,number,date,file,name,details])).rows[0];
 const quote=await q(),s=await convert(quote);assert.equal(s.po_date,null);assert.equal(s.po_number,'');assert.equal(s.delivery_details.no_po,true);assert.equal(s.status,'confirmed');assert.equal((await convert(quote)).id,s.id);
 assert.equal((await db.query('select count(*)::int n from crm_so_approvals')).rows[0].n,1);assert.equal((await db.query('select sum(net_amount)::int n from kc_dw_sales_order_facts')).rows[0].n,100);
 await assert.rejects(convert(await q(),{no_po:false}),/PO number and date/);
 await assert.rejects(convert(await q(),{no_po:true},'PO-STALE'),/cannot include/);
 await assert.rejects(convert(await q(),{no_po:'true'}),/Invalid PO choice/);
 await assert.rejects(convert(await q(),{},'PO-2','2026-01-01','bad/path','po.pdf'),/Upload the customer PO/);
 const provided=await convert(await q(),{},'PO-2','2026-01-01',id+'/po.pdf','po.pdf');assert.equal(provided.delivery_details.no_po,false);assert.equal(provided.po_number,'PO-2');
 const request='22222222-2222-4222-8222-222222222222';
 await db.query("insert into crm_so_amendments(id,sales_order_id,status,reviewed_by,base_updated_at,reason) values($1,$2,'approved','33333333-3333-4333-8333-333333333333',$3,'Revise note')",[request,s.id,s.updated_at]);
 await db.query("insert into crm_sales_order_cost_sheets(sales_order_id,cost_total,gp_amount,gp_margin,line_financials) values($1,50,50,50,'[{\"cost_total\":50}]')",[s.id]);
 const patch={no_po:true,po_number:'',po_date:null,po_file_key:'',po_file_name:'',delivery_details:s.delivery_details,note:'Revised without PO',tax_rate:7,wht_rate:0,document_discount:0,items:[{name:'Item',original_index:0,qty:1,price:100,cost:50,unit:'Unit'}]};
 const revised=(await db.query('select (private.crm_save_so_amendment($1,$2,$3)).*',[request,s.updated_at,patch])).rows[0];assert.equal(revised.delivery_details.no_po,true);assert.equal(revised.po_date,null);assert.equal(Number(revised.total),107);assert.equal(revised.note,'Revised without PO');
 assert.equal((await db.query('select status from crm_so_approvals where sales_order_id=$1',[s.id])).rows[0].status,'pending');
 await db.exec("select set_config('test.approval_failure','true',false)");const rejectedQuote=await q();await assert.rejects(convert(rejectedQuote),/Approval unavailable/);assert.equal((await db.query('select count(*)::int n from crm_sales_orders where quotation_id=$1',[rejectedQuote])).rows[0].n,0);
 await db.exec("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(convert(await q()),/permission required/);
 assert.equal((await db.query("select has_function_privilege('authenticated','private.crm_sales_order_create_po(uuid,text,date,text,text,date,text,jsonb,boolean)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
