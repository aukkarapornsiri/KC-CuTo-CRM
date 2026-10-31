import {quoteTotals} from './internal-model.mjs';
import {rentalTerms,validateRentalPayment} from './rental-quotation.mjs';
export const BILLING_PERIODS=['day','month','year','once'];
export const periodLabel=(period,lang='th')=>({day:lang==='th'?'รายวัน':'Daily',month:lang==='th'?'รายเดือน':'Monthly',year:lang==='th'?'รายปี':'Yearly',once:lang==='th'?'ระยะสั้น / เหมาจ่าย':'Short-term / Lump sum'}[period]||'');
export function recurringLine(item){
 if(!item.billing_period)return {};
 const billing_period=item.billing_period,cycle_count=Number(item.cycle_count);
 if(billing_period==='once'){if(cycle_count!==1)throw Error('Lump sum requires one cycle');return {billing_period,cycle_count:1,service_start:String(item.service_start||''),service_end:String(item.service_end||'')};}
 if(!BILLING_PERIODS.includes(billing_period)||!Number.isInteger(cycle_count)||cycle_count<1||cycle_count>36600)throw Error('รอบบริการไม่ถูกต้อง / Invalid billing period or cycle count');
 return {billing_period,cycle_count,service_start:String(item.service_start||''),service_end:serviceEnd(item.service_start,billing_period,cycle_count)};
}
export function serviceEnd(start,period,count){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!Number.isInteger(Number(count))||Number(count)<1||!BILLING_PERIODS.includes(period))return '';
 if(period==='once')return '';
 const d=new Date(start+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==start)return '';
 if(period==='day')d.setUTCDate(d.getUTCDate()+Number(count));
 else {const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+Number(count)*(period==='year'?12:1));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}
 d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);
}
export function validateRecurring(quote){
 if((quote.quotation_kind||'standard')==='standard'){if(quote.items?.some(i=>i.billing_period))throw Error('ใบเสนอราคาทั่วไปต้องไม่มีรอบบริการ / Standard quotation cannot have billing cycles');return {};}
 if(quote.quotation_kind!=='recurring')throw Error('Invalid quotation type');
 const r=quote.recurring||{},valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&serviceEnd(s,'day',1)===s;
 if(!valid(r.start_date)||!valid(r.end_date)||r.end_date<r.start_date||!['advance','arrears','advance_once'].includes(r.billing_timing))throw Error('กรุณาตรวจสอบระยะสัญญาและเงื่อนไขเรียกเก็บ / Check contract dates and billing timing');
 for(const item of quote.items||[]){const line=recurringLine(item);if(!line.billing_period||!valid(line.service_end)||!valid(line.service_start)||line.service_end<line.service_start||line.service_start<r.start_date||line.service_end>r.end_date)throw Error('ช่วงบริการทุกรายการต้องอยู่ภายในสัญญา / Every service period must be within the contract');}
 if(r.rental?.payment==='partial')validateRentalPayment(quote,quoteTotals(quote.items,{taxRate:quote.tax_rate??7,withholdingRate:quote.wht_rate??0,documentDiscount:quote.document_discount??0,requireName:false}));
 return {start_date:r.start_date,end_date:r.end_date,billing_timing:r.billing_timing,...rentalTerms(r,quote.items)};
}
export function defaultRecurring(start){return {start_date:start,end_date:serviceEnd(start,'year',1),billing_timing:'advance'};}

export function recurringBillingText(timing,lang='th'){
 const th=lang==='th';
 if(timing==='advance_once')return {label:th?'จ่ายล่วงหน้าครั้งเดียว':'One-time upfront payment',description:th?'เรียกเก็บเต็มจำนวนทั้งสัญญาครั้งเดียวก่อนส่งสินค้า':'Full contract amount billed once before delivery',totalNote:th?'ยอดรวมเป็นยอดเรียกเก็บเต็มจำนวนครั้งเดียวก่อนส่งสินค้า':'The total is payable in full once before delivery'};
 return {label:timing==='arrears'?(th?'หลังใช้บริการ':'In arrears'):(th?'ล่วงหน้า':'In advance'),description:timing==='arrears'?(th?'เรียกเก็บหลังใช้บริการตามรอบของแต่ละรายการ':'Billed in arrears per service cycle'):(th?'เรียกเก็บล่วงหน้าตามรอบของแต่ละรายการ':'Billed in advance per service cycle'),totalNote:th?'ยอดรวมเป็นมูลค่าทั้งสัญญา ไม่ใช่ยอดเรียกเก็บครั้งเดียว':'Totals are for the entire contract, not a single invoice'};
}
