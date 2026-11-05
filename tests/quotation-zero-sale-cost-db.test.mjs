import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('persisted quotation financials include all zero-sale item costs and quantities',async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema private;
 create function private.crm_can(text,text) returns boolean language sql as $$select true$$;
 create table quotations(id uuid primary key default gen_random_uuid(),quotation_kind text default 'standard',recurring jsonb default '{}',items jsonb,tax_rate numeric default 7,wht_rate numeric default 0,document_discount numeric default 0,subtotal numeric,discount numeric,vat numeric,total numeric,withholding_tax numeric,net_total numeric,gp_amount numeric,gp_margin numeric,status text,approval_status text,approval_comment text,updated_at timestamptz);
 create table crm_price_items(id uuid,cost numeric,account360_vat_mode text,status text,product_details jsonb);
 create table crm_quotation_financials(quotation_id uuid primary key,cost_total numeric,gp_amount numeric,gp_margin numeric,updated_at timestamptz,line_financials jsonb);
 `);
 await db.exec(fs.readFileSync('db/recurring-upfront-once.sql','utf8'));await db.exec(fs.readFileSync('db/quotation-line-rounding.sql','utf8'));
 await db.exec(`create trigger a_guard before insert or update on quotations for each row execute function private.crm_quote_recurring_guard();create trigger b_totals before insert or update on quotations for each row execute function private.crm_quote_totals();insert into quotations(items) values('[{"name":"Legacy","qty":2,"price":100,"cost":60}]');`);

 await db.exec(fs.readFileSync('db/rental-quotation.sql','utf8'));
 const items=[{name:'Paid',qty:1,price:250000,cost:148874.4},{name:'Free scanner',qty:1,price:0,cost:7327.81},{name:'Free batteries',qty:5,price:0,cost:1115.91}];
 const id=(await db.query('insert into quotations(items) values($1) returning id',[JSON.stringify(items)])).rows[0].id;
 const f=(await db.query('select cost_total::float8,gp_amount::float8,gp_margin::float8,line_financials from crm_quotation_financials where quotation_id=$1',[id])).rows[0];
 assert.equal(f.cost_total,161781.76);assert.equal(f.gp_amount,88218.24);assert.equal(f.gp_margin,35.29);assert.equal(f.line_financials[1].cost_total,7327.81);assert.equal(f.line_financials[2].cost_total,5579.55);assert.equal(f.line_financials[1].gp,-7327.81);
 }finally{await db.close();}});
