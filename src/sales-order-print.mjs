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
 const net=Number(order.subtotal||0)-Number(order.discount||0);
 const cost= num(financial?.cost_total)?Number(financial.cost_total):Array.isArray(lines)&&lines.length===(order.items||[]).length&&lines.every(x=>num(x?.cost_total))?lines.reduce((v,x)=>v+Number(x.cost_total),0):null;
 const gp=num(financial?.gp_amount)?Number(financial.gp_amount):num(cost)?net-Number(cost):null;
 const margin=num(financial?.gp_margin)?Number(financial.gp_margin):num(gp)&&net?gp/net*100:null;
 const approvalStep=(i,name,role)=>'<div class="cs-approval"><b>'+i+' '+name+'</b><small>'+role+'</small><span>Name / Signature __________________</span></div>';
 const summary='<div class="cs-section-title">04 &nbsp; '+t('สรุปยอดขายและกำไร','FINANCIAL SUMMARY')+'</div><div class="cs-totals"><div>'+t('ยอดขายก่อน VAT','Net sales (ex VAT)')+'<strong>'+money(net)+'</strong></div><div>'+t('ต้นทุนรวม','Total inventory cost')+'<strong>'+money(cost)+'</strong></div><div>'+t('กำไรขั้นต้น','Gross profit')+'<strong>'+money(gp)+'</strong><small>GP '+(num(margin)?money(margin)+'%':'—')+'</small></div><div class="cs-grand">TOTAL ORDER VALUE<strong>'+money(order.total)+' '+escape(order.currency||'THB')+'</strong><small>VAT '+money(order.vat)+'</small></div></div>';
 const approvals='<div class="cs-section-title">05 &nbsp; '+t('การอนุมัติและการเปิดงานภายใน','INTERNAL APPROVAL & RELEASE')+'</div><div class="cs-approvals">'+approvalStep('01','PREPARED BY','Sales')+approvalStep('02','COST REVIEW','Finance')+approvalStep('03','APPROVED BY','Manager')+approvalStep('04','RELEASE TO OPS','Operations')+'</div>';
 let html=salesOrderHTML(order,lang).replace('<h1>','<h1>Cost Sheet · ').replace(/<table>[\s\S]*?<\/table>/,table);
 html=html.replace('<header><strong>KC CuTo CRM</strong>','<header class="cs-header"><div class="cs-emblem" aria-label="KC CuTo CRM">KC</div><strong>KC CuTo CRM / SALES OPERATIONS</strong><div class="cs-confidential">CONFIDENTIAL • INTERNAL ONLY</div>');
 html=html.replace(/<div class="total">[\s\S]*?<\/div>/,summary+approvals);
 const css='@page{size:A4 landscape;margin:10mm}body{font-family:"IBM Plex Sans Thai",Arial,sans-serif;font-size:10px;color:#14243d}header.cs-header{position:relative;min-height:85px;border-bottom:3px solid #d9a51e;padding-bottom:15px}header.cs-header h1{font-size:28px;letter-spacing:-.5px}header.cs-header .cs-emblem{float:right;width:78px;height:75px;margin-left:16px;border:1px solid #e2e8f0;border-radius:11px;display:grid;place-items:center;color:#d49b12;font-size:32px;font-weight:900}header.cs-header .cs-confidential{float:right;padding:8px 12px;border-radius:9px;background:#fff5dc;color:#a57400;font-weight:700}table{table-layout:fixed}th{background:#14243d;color:white;font-size:9px}th,td{padding:7px 5px;overflow-wrap:anywhere;vertical-align:top;border-bottom:1px solid #e2e8f0}th:nth-child(1){width:3%}th:nth-child(2){width:25%}th:nth-child(3){width:12%}tbody tr:nth-child(even){background:#f7f9fc}td b{color:#12253f}.cs-section-title{font-weight:800;font-size:12px;margin:17px 0 7px;padding:7px 10px;background:#14243d;color:#fff;border-radius:4px}.cs-totals{display:grid;grid-template-columns:1fr 1fr 1fr 1.6fr;gap:7px;break-inside:avoid}.cs-totals>div{background:#f3f6fa;border-radius:7px;padding:10px;font-size:9px}.cs-totals strong{display:block;font-size:19px;margin:5px 0}.cs-totals small{display:block;color:#5a728f}.cs-totals>.cs-grand{background:#14243d;color:white}.cs-totals>.cs-grand strong{font-size:21px;color:#f4c14b}.cs-totals>.cs-grand small{color:#d7e2f2}.cs-approvals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;break-inside:avoid}.cs-approval{border:1px solid #d9e1ed;border-top:3px solid #d9a51e;border-radius:7px;min-height:71px;padding:8px}.cs-approval b,.cs-approval small,.cs-approval span{display:block}.cs-approval small{margin:4px 0;color:#64748b}.cs-approval span{margin-top:12px;font-size:8px}';
 return html.replace(/<footer>[\s\S]*?<\/footer>/,'<footer>KC CuTo CRM • INTERNAL USE ONLY • Restricted Cost Information</footer>').replace('</style>',css+'</style>');
}
export async function printCostSheet(order,loadFinancial,lang){
 // Open synchronously so mobile popup blockers do not discard the print action.
 const popup=window.open('','_blank');if(!popup)throw Error(lang==='th'?'กรุณาอนุญาตหน้าต่างพิมพ์':'Allow the print window');
 popup.opener=null;
 try{const financial=await loadFinancial();if(!financial)throw Error(lang==='th'?'ไม่พบ Cost Sheet หรือไม่มีสิทธิ์ดูต้นทุน':'Cost Sheet unavailable or cost access denied');popup.document.write(costSheetHTML(order,financial,lang));popup.document.close();popup.focus();popup.print();}catch(e){popup.close();throw e;}
}
