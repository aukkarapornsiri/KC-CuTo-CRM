const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function salesOrderHTML(order,lang='th'){
 const t=(th,en)=>lang==='th'?th:en,money=n=>escape(new Intl.NumberFormat(lang==='th'?'th-TH':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0)));
 const rows=(order.items||[]).map(item=>`<tr><td>${escape(item.name)}<small>${escape(item.desc||'')}</small></td><td>${escape(item.qty)} ${escape(item.unit)}</td><td>${money(item.price)}</td><td>${money(item.total)}</td></tr>`).join('');
 return `<!doctype html><html lang="${lang==='th'?'th':'en'}"><meta charset="utf-8"><title>${escape(order.code)}</title><style>@page{size:A4;margin:16mm}body{font:14px sans-serif;color:#0f172a}h1{font-size:24px}header{border-bottom:2px solid #2563eb;padding-bottom:12px}dl{display:grid;grid-template-columns:140px 1fr;gap:8px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:10px;border-bottom:1px solid #dbe3ec}thead{display:table-header-group}tr{break-inside:avoid}small{display:block;white-space:pre-wrap;color:#475569}.total{text-align:right;break-inside:avoid}footer{margin-top:24px;color:#64748b;white-space:pre-wrap}.cancelled{color:#b91c1c;font-size:22px}</style><header><strong>KC CuTo CRM</strong><h1>${t('ใบสั่งขาย','Sales Order')} ${escape(order.code)}</h1>${order.status==='cancelled'?`<p class="cancelled">${t('ยกเลิกแล้ว','CANCELLED')}</p>`:''}</header><dl><dt>${t('ลูกค้า','Customer')}</dt><dd>${escape(order.customer_name)}</dd><dt>${t('ที่อยู่','Address')}</dt><dd>${escape(order.billing_address)}</dd><dt>${t('เลขผู้เสียภาษี','Tax ID')}</dt><dd>${escape(order.tax_id)}</dd><dt>${t('ใบเสนอราคา','Quotation')}</dt><dd>${escape(order.quotation_code)}</dd><dt>PO</dt><dd>${escape(order.po_number)} · ${escape(order.po_date)}</dd><dt>${t('กำหนดส่งมอบ','Expected delivery')}</dt><dd>${escape(order.expected_delivery_date||'—')}</dd><dt>${t('พนักงานขาย','Salesperson')}</dt><dd>${escape(order.owner_name)}</dd></dl><table><thead><tr><th>${t('รายการ','Item')}</th><th>${t('จำนวน','Quantity')}</th><th>${t('ราคาต่อหน่วย','Unit price')}</th><th>${t('ยอดรายการ','Line total')}</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><p>${t('ยอดก่อน VAT','Net before VAT')}: ${money(Number(order.subtotal)-Number(order.discount))}</p><p>VAT: ${money(order.vat)}</p><h3>${t('ยอดรวม','Total')}: ${money(order.total)} ${escape(order.currency)}</h3></div><footer>${escape(order.note)}</footer></html>`;
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
 const net=Number(order.subtotal)-Number(order.discount||0);
 const verified=num(financial?.cost_total)&&num(financial?.gp_amount)&&Math.abs(net-Number(financial.cost_total)-Number(financial.gp_amount))<=.02;
 const summary=`<section class="cost-summary"><h3>${t('สำหรับใช้ภายในเท่านั้น','INTERNAL USE ONLY')}</h3><p>${t('ต้นทุนรวม','Total cost')}: ${money(verified?financial.cost_total:null)} · GP: ${money(verified?financial.gp_amount:null)} · GP %: ${money(verified?financial.gp_margin:null)}</p><p>${t('GP รายการหักส่วนลดรายการแล้ว ส่วน GP รวมหักส่วนลดท้ายบิลด้วย ตัวเลขไม่รวม VAT · — หมายถึงไม่มีต้นทุนที่ตรวจสอบได้','Line GP includes line discounts; total GP also includes document discount. Figures exclude VAT. — means verified cost is unavailable.')}</p><h3>${t('เงื่อนไขพิเศษ / หมายเหตุ SO','Special conditions / SO notes')}</h3><p class="terms">${escape(order.note||'—')}</p><h3>${t('เงื่อนไขจากใบเสนอราคา','Quotation conditions')}</h3><p class="terms">${escape(financial?.quotation_note||'—')}</p><p class="terms">${escape(financial?.payment_instructions||'')}</p><p>${t('เครดิตชำระเงิน (วัน)','Payment credit (days)')}: ${escape(order.payment_terms??'—')}</p></section>`;
 return html.replace(/<footer>[\s\S]*?<\/footer>/,summary).replace('</style>','@page{size:A4 landscape;margin:12mm}body{font-size:11px}table{table-layout:fixed}th,td{padding:6px;overflow-wrap:anywhere;vertical-align:top}th:nth-child(1){width:3%}th:nth-child(2){width:26%}th:nth-child(3){width:12%}.terms{white-space:pre-wrap;overflow-wrap:anywhere}.cost-summary{margin-top:16px}.cost-summary h3{break-after:avoid}</style>');
}
export async function printCostSheet(order,loadFinancial,lang){
 // Open synchronously so mobile popup blockers do not discard the print action.
 const popup=window.open('','_blank');if(!popup)throw Error(lang==='th'?'กรุณาอนุญาตหน้าต่างพิมพ์':'Allow the print window');
 popup.opener=null;
 try{const financial=await loadFinancial();if(!financial)throw Error(lang==='th'?'ไม่พบ Cost Sheet หรือไม่มีสิทธิ์ดูต้นทุน':'Cost Sheet unavailable or cost access denied');popup.document.write(costSheetHTML(order,financial,lang));popup.document.close();popup.focus();popup.print();}catch(e){popup.close();throw e;}
}
