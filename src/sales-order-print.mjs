import {DESIGN_FONTS,normalizeDesign} from './quotation-designer.mjs';
import {periodLabel} from './quotation-recurring.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function salesOrderHTML(order,lang='th'){
 const t=(th,en)=>lang==='th'?th:en,money=n=>escape(new Intl.NumberFormat(lang==='th'?'th-TH':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0)));
 const rows=(order.items||[]).map(item=>`<tr><td>${escape(item.name)}<small>${escape(item.desc||'')}</small>${item.billing_period?`<small>${escape(periodLabel(item.billing_period,lang))} × ${escape(item.cycle_count)} · ${escape(item.service_start)} – ${escape(item.service_end)}</small>`:''}</td><td>${escape(item.qty)} ${escape(item.unit)}</td><td>${money(item.price)}</td><td>${money(item.total)}</td></tr>`).join('');
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

export function costSheetHTML(order,financial,lang='th',context={}){
 const t=(th,en)=>lang==='th'?th:en;
 const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const money=v=>num(v)?Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const lines=financial?.line_financials;
 const rows=(order.items||[]).map((item,i)=>{
  const f=Array.isArray(lines)&&lines.length===order.items.length?lines[i]:null;
  const part=item.part_number||String(item.desc||'').match(/(?:Part\s*(?:Number|No\.?|#)|P\/N)\s*:\s*([^\n]+)/i)?.[1]||'—';
  return `<tr><td>${i+1}</td><td><b>${escape(item.name)}</b><small>${escape(item.desc)}</small>${item.billing_period?`<small>${escape(periodLabel(item.billing_period,lang))} × ${escape(item.cycle_count)} · ${escape(item.service_start)} – ${escape(item.service_end)}</small>`:''}<small>${t('รหัสสินค้า','Item code')}: ${escape(item.code||'—')}</small></td><td>${escape(part)}</td><td>${escape(item.qty)} ${escape(item.unit)}</td><td>${money(item.price)}</td><td>${money(item.total)}</td><td>${money(num(f?.cost_total)&&Number(item.qty)>0?Number(f.cost_total)/Number(item.qty)/(Number(item.cycle_count)||1):null)}</td><td>${money(f?.cost_total)}</td><td>${money(f?.gp)}</td><td>${money(f?.margin)}</td></tr>`;
 }).join('');
 const headers=['#',t('สินค้า / Spec','Item / Spec'),'Part Number',t('จำนวน','Qty'),t('ราคาขาย/หน่วย','Unit sale'),t('ขายสุทธิรายการ','Line net'),t('ต้นทุน/หน่วย','Unit cost'),t('ต้นทุนรวม','Total cost'),'GP','GP %'];
 const table=`<table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
 const net=Number(order.subtotal||0)-Number(order.discount||0);
 const cost= num(financial?.cost_total)?Number(financial.cost_total):Array.isArray(lines)&&lines.length===(order.items||[]).length&&lines.every(x=>num(x?.cost_total))?lines.reduce((v,x)=>v+Number(x.cost_total),0):null;
 const gp=num(financial?.gp_amount)?Number(financial.gp_amount):num(cost)?net-Number(cost):null;
 const margin=num(financial?.gp_margin)?Number(financial.gp_margin):num(gp)&&net?gp/net*100:null;
 const approval=context.approval, signed=approval?.status==='approved';
 const signature=signed&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(context.signature||'')?context.signature:'';
 const approvalStep=(i,name,role)=>'<div class="cs-approval"><b>'+i+' '+name+'</b><small>'+role+'</small>'+(i==='03'&&signed?'<div class="cs-signed">'+(signature?'<img alt="Approver signature" src="'+signature+'">':'')+'<small>'+escape(approval.reviewer_name||'')+'</small><small>'+escape(approval.reviewed_at?new Date(approval.reviewed_at).toLocaleString(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok'}):'')+'</small></div>':'<span>Name / Signature __________________</span>')+'</div>';
 const summary='<div class="cs-section-title">'+t('สรุปยอดขายและกำไร','FINANCIAL SUMMARY')+'</div><div class="cs-totals"><div>'+t('ยอดขายก่อน VAT','Net sales (ex VAT)')+'<strong>'+money(net)+'</strong></div><div>'+t('ต้นทุนรวม','Total inventory cost')+'<strong>'+money(cost)+'</strong></div><div>'+t('กำไรขั้นต้น','Gross profit')+'<strong>'+money(gp)+'</strong><small>GP '+(num(margin)?money(margin)+'%':'—')+'</small></div><div class="cs-grand">TOTAL ORDER VALUE<strong>'+money(order.total)+' '+escape(order.currency||'THB')+'</strong><small>VAT '+money(order.vat)+'</small></div></div>';
 const approvals='<div class="cs-section-title">'+t('การอนุมัติและการเปิดงานภายใน','INTERNAL APPROVAL & RELEASE')+'</div><div class="cs-approvals">'+approvalStep('01','PREPARED BY','Sales')+approvalStep('02','COST REVIEW','Finance')+approvalStep('03','APPROVED BY','Manager')+approvalStep('04','RELEASE TO OPS','Operations')+'</div>';
 const d=order.delivery_details||{},field=(label,value)=>`<div class="cs-field"><b>${escape(label)}</b><span>${escape(value??'—')}</span></div>`;
 const meta=[
  [t('เลขที่ใบเสนอราคา','Quotation'),order.quotation_code],[t('เลขที่ PO','PO number'),order.po_number],
  [t('เลขผู้เสียภาษี','Tax ID'),order.tax_id],[t('ประเภทงาน','Order type'),d.order_type],
  [t('ฝ่ายขาย','Salesperson'),order.owner_name],[t('วันที่ PO','PO date'),order.po_date],
  [t('กำหนดส่งมอบ','Delivery date'),order.expected_delivery_date],[t('เครดิต','Payment terms'),order.payment_terms==null?'—':order.payment_terms+' '+t('วัน','days')]
 ];
 const delivery=[
  [t('ส่งของให้','Ship to'),d.ship_to_name||order.customer_name],
  [t('เปิดบิล / วางบิลให้','Bill to'),d.bill_to_name||order.customer_name],
  [t('สถานที่ส่งของ','Shipping address'),d.shipping_address||order.billing_address],
  [t('สถานที่วางบิล','Billing location'),d.billing_location||order.billing_address]
 ];
 const contact=[
  [t('ผู้รับสินค้า','Recipient'),d.recipient_name],[t('โทรศัพท์','Phone'),d.recipient_phone],
  [t('การติดตั้ง','Installation'),d.installation==='yes'?t('มี','Yes'):d.installation==='no'?t('ไม่มี','No'):'—'],
  [t('มี PO','PO available'),order.po_file_key||order.po_number?t('มี','Yes'):t('ไม่มี','No')]
 ];
 const css=`@page{size:A4 landscape;margin:8mm}
 *{box-sizing:border-box;color:#000!important;-webkit-text-fill-color:#000!important}
 html{background:#fff}body{margin:0;font:10px/1.35 ${DESIGN_FONTS[normalizeDesign(context.template?.design_options).font]}}
 .cs-header{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1.5px solid #000;padding-bottom:7px;margin-bottom:7px}
 .cs-header strong{font-size:12px}.cs-header h1{font-size:20px;line-height:1.2;margin:2px 0 0}.cs-doc-id{text-align:right;font-size:15px;font-weight:700}.cs-doc-id small{display:block;font-size:9px;font-weight:400;margin-top:2px}
 .cs-meta,.cs-contact{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px 14px}
 .cs-meta .cs-field b{display:inline;margin-right:5px}.cs-field{min-width:0;overflow-wrap:anywhere}.cs-field b{display:block;font-size:9px;margin-bottom:1px}.cs-field span{white-space:pre-wrap}
 .cs-delivery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px;border-top:1px solid #d4d4d4;border-bottom:1px solid #d4d4d4;padding:5px 0;margin:6px 0}
 .cs-contact .cs-field b{display:inline;margin-right:5px}.cs-note{margin:5px 0 7px;white-space:pre-wrap;overflow-wrap:anywhere}
 table{width:100%;border-collapse:collapse;table-layout:fixed;margin:8px 0 0}
 thead{display:table-header-group}th{background:#ededed;font-size:9px;font-weight:700;border-top:1px solid #aaa;border-bottom:1px solid #aaa}
 th,td{padding:5px 4px;text-align:right;vertical-align:top;overflow-wrap:anywhere}td{border-bottom:1px solid #d4d4d4}
 th:nth-child(1){width:3%}th:nth-child(2){width:34%}th:nth-child(3){width:10%}th:nth-child(4){width:6%}th:nth-child(n+5){width:7%}th:last-child{width:5%}
 th:nth-child(-n+3),td:nth-child(-n+3){text-align:left}td b{font-size:10px}td small{display:block;font-size:9px;line-height:1.25;white-space:pre-wrap}tbody tr{break-inside:avoid}
 .cs-closing{break-inside:avoid}.cs-section-title{font-size:10px;font-weight:700;margin:8px 0 4px;padding:0}
 .cs-totals{display:grid;grid-template-columns:1fr 1fr 1fr 1.35fr;gap:8px}.cs-totals>div{border:1px solid #d0d0d0;background:#f5f5f5;padding:6px 9px;font-size:9px;border-radius:3px}.cs-totals strong{display:block;font-size:17px;line-height:1.25;margin:3px 0 0}.cs-totals small{font-size:8px}.cs-grand{border-color:#777!important}
 .cs-approvals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.cs-approval{border:1px solid #aaa;border-radius:3px;padding:6px 8px;min-height:59px}.cs-approval b,.cs-approval small,.cs-approval span{display:block}.cs-approval b{font-size:9px}.cs-approval small{font-size:8px;margin-top:1px}.cs-approval span{font-size:8px;margin-top:14px}
 .cs-signed img{display:block;width:140px;height:28px;object-fit:contain;object-position:left}.cs-signed{margin-top:2px}
 footer{font-size:8px;margin-top:6px;border-top:1px solid #d4d4d4;padding-top:4px}
 @media screen{body{max-width:281mm;margin:20px auto;padding:8mm;background:#fff}}`;
 return `<!doctype html><html lang="${lang==='th'?'th':'en'}"><head><meta charset="utf-8"><title>Cost Sheet ${escape(order.code)}</title><style>${css}</style></head><body>
 <header class="cs-header"><div><strong>KC CuTo CRM</strong><h1>Cost Sheet · ${t('ใบสั่งขาย','Sales Order')}</h1></div><div class="cs-doc-id">${escape(order.code)}<small>${t('เอกสารภายในองค์กร','INTERNAL USE ONLY')}${order.status==='cancelled'?' · '+t('ยกเลิกแล้ว','CANCELLED'):''}</small></div></header>
 <section class="so-header-details"><div class="cs-meta">${meta.map(x=>field(...x)).join('')}</div><div class="cs-delivery">${delivery.map(x=>field(...x)).join('')}</div><div class="cs-contact">${contact.map(x=>field(...x)).join('')}</div>${order.note?`<p class="cs-note"><b>${t('เงื่อนไขพิเศษ','Special conditions')}:</b> ${escape(order.note)}</p>`:''}</section>
 ${table}<section class="cs-closing">${summary}${approvals}<footer>KC CuTo CRM · INTERNAL USE ONLY · Restricted Cost Information</footer></section></body></html>`;
}
export async function printCostSheet(order,loadFinancial,lang,loadContext=async()=>({})){
 // Open synchronously so mobile popup blockers do not discard the print action.
 const popup=window.open('','_blank');if(!popup)throw Error(lang==='th'?'กรุณาอนุญาตหน้าต่างพิมพ์':'Allow the print window');
 popup.opener=null;
 try{const financial=await loadFinancial();if(!financial)throw Error(lang==='th'?'ไม่พบ Cost Sheet หรือไม่มีสิทธิ์ดูต้นทุน':'Cost Sheet unavailable or cost access denied');const context=await loadContext();popup.document.write(costSheetHTML(order,financial,lang,context));popup.document.close();await popup.document.fonts?.ready;await Promise.all([...popup.document.images].map(img=>img.decode()));popup.focus();popup.print();}catch(e){popup.close();throw e;}
}
