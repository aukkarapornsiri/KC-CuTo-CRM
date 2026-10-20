const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function salesOrderHTML(order,lang='th'){
 const t=(th,en)=>lang==='th'?th:en,money=n=>escape(new Intl.NumberFormat(lang==='th'?'th-TH':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0)));
 const rows=(order.items||[]).map(item=>`<tr><td>${escape(item.name)}<small>${escape(item.desc||'')}</small></td><td>${escape(item.qty)} ${escape(item.unit)}</td><td>${money(item.price)}</td><td>${money(item.total)}</td></tr>`).join('');
 const html=`<!doctype html><html lang="${lang==='th'?'th':'en'}"><meta charset="utf-8"><title>${escape(order.code)}</title><style>@page{size:A4;margin:16mm}body{font:14px sans-serif;color:#0f172a}h1{font-size:24px}header{border-bottom:2px solid #2563eb;padding-bottom:12px}dl{display:grid;grid-template-columns:140px 1fr;gap:8px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:10px;border-bottom:1px solid #dbe3ec}thead{display:table-header-group}tr{break-inside:avoid}small{display:block;white-space:pre-wrap;color:#475569}.total{text-align:right;break-inside:avoid}footer{margin-top:24px;color:#64748b;white-space:pre-wrap}.cancelled{color:#b91c1c;font-size:22px}</style><header><strong>KC CuTo CRM</strong><h1>${t('ใบสั่งขาย','Sales Order')} ${escape(order.code)}</h1>${order.status==='cancelled'?`<p class="cancelled">${t('ยกเลิกแล้ว','CANCELLED')}</p>`:''}</header><dl><dt>${t('ลูกค้า','Customer')}</dt><dd>${escape(order.customer_name)}</dd><dt>${t('ที่อยู่','Address')}</dt><dd>${escape(order.billing_address)}</dd><dt>${t('เลขผู้เสียภาษี','Tax ID')}</dt><dd>${escape(order.tax_id)}</dd><dt>${t('ใบเสนอราคา','Quotation')}</dt><dd>${escape(order.quotation_code)}</dd><dt>PO</dt><dd>${escape(order.po_number)} · ${escape(order.po_date)}</dd><dt>${t('กำหนดส่งมอบ','Expected delivery')}</dt><dd>${escape(order.expected_delivery_date||'—')}</dd><dt>${t('พนักงานขาย','Salesperson')}</dt><dd>${escape(order.owner_name)}</dd></dl><table><thead><tr><th>${t('รายการ','Item')}</th><th>${t('จำนวน','Quantity')}</th><th>${t('ราคาต่อหน่วย','Unit price')}</th><th>${t('ยอดรายการ','Line total')}</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><p>${t('ยอดก่อน VAT','Net before VAT')}: ${money(Number(order.subtotal)-Number(order.discount))}</p><p>VAT: ${money(order.vat)}</p><h3>${t('ยอดรวม','Total')}: ${money(order.total)} ${escape(order.currency)}</h3></div><footer></footer></html>`;
 const d=order.delivery_details||{},yesNo=v=>v==='yes'?t('มี','Yes'):v==='no'?t('ไม่มี','No'):'—';
 const fields=[
  [t('เลขผู้เสียภาษี','Tax ID'),order.tax_id],[t('ประเภท','Type'),d.order_type],
  [t('เลขที่ SO','SO number'),order.code],[t('เลขที่ PO','PO number'),order.po_number],
  [t('เงื่อนไขชำระเงิน','Payment terms'),order.payment_terms==null?'—':order.payment_terms+' '+t('วัน','Days')],[t('วันที่ส่งของ','Delivery date'),order.expected_delivery_date],
  [t('ส่งของ','Ship to'),d.ship_to_name||order.customer_name,true],[t('สถานที่ส่งของ','Shipping address'),d.shipping_address,true],
  [t('เปิดบิล / วางบิล','Bill to'),d.bill_to_name||order.customer_name,true],[t('สถานที่วางบิล','Billing location'),d.billing_location||order.billing_address,true],
  [t('มี PO','PO available'),order.po_file_key||order.po_number?t('มี','Yes'):t('ไม่มี','No')],[t('ชื่อคนรับสินค้า','Recipient'),d.recipient_name],
  [t('มีการติดตั้ง','Installation'),yesNo(d.installation)],[t('เบอร์ผู้รับสินค้า','Recipient phone'),d.recipient_phone],
  [t('เงื่อนไขพิเศษ','Special conditions'),order.note,true]
 ];
 const info=`<aside class="so-header-details">${fields.map(([label,value,wide])=>`<div class="so-info${wide?' wide':''}"><b>${escape(label)}:</b><span>${escape(value||'—')}</span></div>`).join('')}</aside>`;
 return html.replace(/<header>([\s\S]*?)<\/header><dl>[\s\S]*?<\/dl>/,(_,head)=>`<header class="so-document-header"><div class="so-header-brand">${head}<p>${t('ใบเสนอราคา','Quotation')}: ${escape(order.quotation_code)}</p><p>${t('พนักงานขาย','Salesperson')}: ${escape(order.owner_name)}</p></div>${info}</header>`)
 .replace('</style>','.so-document-header{display:block}.so-document-header:after{content:"";display:block;clear:both}.so-header-brand{float:left;width:30%}.so-header-brand h1{font-size:20px;overflow-wrap:anywhere}.so-header-details{margin-left:34%;font-size:11px}.so-info{display:inline-block;vertical-align:top;width:48%;margin:0 1% 7px 0;overflow-wrap:anywhere}.so-info b{margin-right:5px}.so-info span{white-space:pre-wrap;overflow-wrap:anywhere}.so-info.wide{width:100%}</style>');
}
export function printSalesOrder(order,lang){
 const popup=window.open('','_blank');if(!popup)throw Error(lang==='th'?'กรุณาอนุญาตหน้าต่างพิมพ์':'Allow the print window');
 popup.opener=null;popup.document.write(salesOrderHTML(order,lang));popup.document.close();popup.focus();popup.print();
}

export function costSheetHTML(order,financial,lang='th'){
 const t=(th,en)=>lang==='th'?th:en;
 const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const money=v=>num(v)?Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const lines=financial?.line_financials;
 const rows=(order.items||[]).map((item,i)=>{
  const f=Array.isArray(lines)&&lines.length===order.items.length?lines[i]:null;
  const part=item.part_number||String(item.desc||'').match(/(?:Part\s*(?:Number|No\.?|#)|P\/N)\s*:\s*([^\n]+)/i)?.[1]||'—';
  return `<tr><td>${i+1}</td><td><b>${escape(item.name)}</b><small>${escape(item.desc)}</small><small>${t('รหัสสินค้า','Item code')}: ${escape(item.code||'—')}</small></td><td>${escape(part)}</td><td>${escape(item.qty)} ${escape(item.unit)}</td><td>${money(item.price)}</td><td>${money(item.total)}</td><td>${money(num(f?.cost_total)&&Number(item.qty)>0?Number(f.cost_total)/Number(item.qty):null)}</td><td>${money(f?.cost_total)}</td><td>${money(f?.gp)}</td><td>${money(f?.margin)}</td></tr>`;
 }).join('');
 const headers=['#',t('สินค้า / Spec','Item / Spec'),'Part Number',t('จำนวน','Qty'),t('ราคาขาย/หน่วย','Unit sale'),t('ขายสุทธิรายการ','Line net'),t('ต้นทุน/หน่วย','Unit cost'),t('ต้นทุนรวม','Total cost'),'GP','GP %'];
 const table=`<table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
 let html=salesOrderHTML(order,lang).replace('<h1>','<h1>Cost Sheet · ').replace(/<table>[\s\S]*?<\/table>/,table);
 return html.replace(/<footer>[\s\S]*?<\/footer>/,'').replace('</style>','@page{size:A4 landscape;margin:12mm}body{font-size:11px}table{table-layout:fixed}th,td{padding:6px;overflow-wrap:anywhere;vertical-align:top}th:nth-child(1){width:3%}th:nth-child(2){width:26%}th:nth-child(3){width:12%}.terms{white-space:pre-wrap;overflow-wrap:anywhere}.cost-summary{margin-top:16px}.cost-summary h3{break-after:avoid}</style>');
}
export async function printCostSheet(order,loadFinancial,lang){
 // Open synchronously so mobile popup blockers do not discard the print action.
 const popup=window.open('','_blank');if(!popup)throw Error(lang==='th'?'กรุณาอนุญาตหน้าต่างพิมพ์':'Allow the print window');
 popup.opener=null;
 try{const financial=await loadFinancial();if(!financial)throw Error(lang==='th'?'ไม่พบ Cost Sheet หรือไม่มีสิทธิ์ดูต้นทุน':'Cost Sheet unavailable or cost access denied');popup.document.write(costSheetHTML(order,financial,lang));popup.document.close();popup.focus();popup.print();}catch(e){popup.close();throw e;}
}
