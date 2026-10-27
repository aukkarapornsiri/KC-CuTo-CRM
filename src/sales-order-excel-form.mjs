import {itemPartNumber} from './item-part-number.mjs';
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const esc=v=>String(v??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const letter=c=>String.fromCharCode(65+c);
// Print form, separate from the legacy tabular data API. Financial data must be
// supplied explicitly by the permission-checked caller, never read from order.items.
export function salesOrderForm(order,approval,lang='th',context={}){
 const t=(th,en)=>lang==='th'?th:en, financial=context.financial, costs=context.includeFinancial===true;
 const d=order.delivery_details||{},rows=[],merges=[];let r=0;
 const row=(cells,height=20)=>{r++;rows.push(`<row r="${r}" ht="${height}" customHeight="1">${cells.map(([start,end,value,style=0])=>{
  if(end>start)merges.push(`${letter(start)}${r}:${letter(end)}${r}`);
  return Array.from({length:end-start+1},(_,i)=>{const ref=letter(start+i)+r;if(i)return `<c r="${ref}" s="${style}"/>`;
   return typeof value==='number'?`<c r="${ref}" s="${style}"><v>${value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value??'—')}</t></is></c>`;
  }).join('');
 }).join('')}</row>`);};
 const full=(value,style=0,height=20)=>row([[0,23,value,style]],height);
 const groups=(values,style=0,height=22)=>row(values.map((v,i)=>[i*6,i*6+5,v,style]),height);
 const field=(label,value)=>`${label}  ${value??'—'}`;
 row([[0,17,'KC CuTo CRM',1],[18,23,order.code,2]],23);
 row([[0,17,costs?t('Cost Sheet · ใบสั่งขาย','Cost Sheet · Sales Order'):t('ใบสั่งขาย','Sales Order'),3],[18,23,t('เอกสารภายในองค์กร','Internal document'),2]],30);
 groups([field(t('เลขที่ใบเสนอราคา','Quotation'),order.quotation_code),field(t('เลขที่ PO','PO number'),order.po_number),field(t('เลขผู้เสียภาษี','Tax ID'),order.tax_id),field(t('ประเภทงาน','Order type'),d.order_type)]);
 groups([field(t('ฝ่ายขาย','Salesperson'),order.owner_name),field(t('วันที่ PO','PO date'),order.po_date),field(t('กำหนดส่งมอบ','Delivery date'),order.expected_delivery_date),field(t('เครดิต','Payment terms'),order.payment_terms==null?'—':order.payment_terms+' '+t('วัน','days'))]);
 row([[0,11,field(t('ส่งของให้','Ship to'),d.ship_to_name||order.customer_name),4],[12,23,field(t('เปิดบิล / วางบิลให้','Bill to'),d.bill_to_name||order.customer_name),4]],28);
 const ship=field(t('สถานที่ส่งของ','Shipping address'),d.shipping_address||order.billing_address),bill=field(t('สถานที่วางบิล','Billing location'),d.billing_location||order.billing_address);
 row([[0,11,ship],[12,23,bill]],Math.max(30,Math.ceil(Math.max(ship.length,bill.length)/95)*15));
 groups([field(t('ผู้รับสินค้า','Recipient'),d.recipient_name),field(t('โทรศัพท์','Phone'),d.recipient_phone),field(t('การติดตั้ง','Installation'),d.installation==='yes'?t('มี','Yes'):d.installation==='no'?t('ไม่มี','No'):'—'),field(t('มี PO','PO available'),order.po_file_key?t('มี','Yes'):'—')],4);
 if(order.note)full(field(t('เงื่อนไขพิเศษ','Special instructions'),order.note),0,Math.max(22,Math.ceil(order.note.length/180)*15));
 const spans=costs?[[0,0],[1,8],[9,11],[12,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,23]]:[[0,0],[1,10],[11,14],[15,17],[18,20],[21,23]];
 const headers=['#',t('สินค้า / Spec','Item / Spec'),'Part Number',t('จำนวน','Qty'),t('ราคาขาย/หน่วย','Unit sale'),t('ขายสุทธิรายการ','Line net'),t('ต้นทุน/หน่วย','Unit cost'),t('ต้นทุนรวม','Total cost'),'GP','GP %'];
 const heading=r+1;row(spans.map(([a,b],i)=>[a,b,headers[i],4]),30);
 const lines=financial?.line_financials,matched=Array.isArray(lines)&&lines.length===(order.items||[]).length;
 for(const [i,item] of (order.items||[]).entries()){
  const f=costs&&matched?lines[i]:null,cost=number(f?.cost_total);
  const values=[i+1,item.name,itemPartNumber(item)||'—',`${item.qty??'—'} ${item.unit||''}`,number(item.price),number(item.total),cost!==null&&Number(item.qty)>0?cost/Number(item.qty)/(Number(item.cycle_count)||1):null,cost,number(f?.gp),number(f?.margin)];
  row(spans.map(([a,b],j)=>[a,b,values[j],j>=4?5: j===1?1:0]),Math.max(25,Math.ceil(Math.max(String(item.name||'').length/65,String(values[2]).length/22))*14));
  const details=[item.desc||'',item.billing_period?`${item.billing_period} × ${item.cycle_count??''} · ${item.service_start||''} – ${item.service_end||''}`:'',`${t('รหัสสินค้า','Item code')}: ${item.code||'—'}`].filter(Boolean).join('\n');
  // Split long descriptions into printable rows instead of Excel's 409pt row cap.
  for(const line of details.split('\n')){const chunks=line.match(new RegExp(`.{1,${costs?66:86}}`,'gu'))||[''];for(const chunk of chunks)row([[spans[1][0],spans[1][1],chunk]],14);}
  full('',4,6);
 }
 const net=Number(order.subtotal||0)-Number(order.discount||0);
 const cost=costs?(number(financial?.cost_total)??(matched&&lines.every(x=>number(x?.cost_total)!==null)?lines.reduce((s,x)=>s+Number(x.cost_total),0):null)):null;
 const gp=costs?(number(financial?.gp_amount)??(cost!==null?net-cost:null)):null;
 const margin=number(financial?.gp_margin)??(gp!==null&&net?gp/net*100:null);
 full(costs?t('สรุปยอดขายและกำไร','FINANCIAL SUMMARY'):t('สรุปยอดขาย','ORDER SUMMARY'),1,24);
 groups(costs?[t('ยอดขายก่อน VAT','Net sales (ex VAT)'),t('ต้นทุนรวม','Total inventory cost'),t('กำไรขั้นต้น','Gross profit'),'TOTAL ORDER VALUE']:[t('ยอดขายก่อน VAT','Net sales (ex VAT)'),t('ส่วนลด','Discount'),'VAT','TOTAL ORDER VALUE'],8);
 groups(costs?[net,cost,gp,number(order.total)]:[net,number(order.discount),number(order.vat),number(order.total)],9,30);
 groups(['','',costs?`GP ${margin===null?'—':margin.toFixed(2)+'%'}`:'',`${order.currency||'THB'} · VAT ${number(order.vat)?.toFixed(2)??'—'}`],10);
 full(t('การอนุมัติและการเปิดงานภายใน','INTERNAL APPROVAL & RELEASE'),1,24);
 groups(['01 PREPARED BY','02 COST REVIEW','03 APPROVED BY','04 RELEASE TO OPS'],8);
 groups(['Sales','Finance','Manager','Operations'],11,18);
 const signatureRow=r;groups(['','','',''],11,42);
 const signed=approval?.status==='approved';
 groups(['Name / Signature __________','Name / Signature __________',signed?(approval.reviewer_name||''):'Name / Signature __________','Name / Signature __________'],11,20);
 const reviewed=signed&&approval.reviewed_at&&Number.isFinite(Date.parse(approval.reviewed_at))?new Date(approval.reviewed_at).toLocaleString(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok'}):'';
 groups(['','',reviewed,''],10,18);
 full('KC CuTo CRM · INTERNAL USE ONLY'+(costs?' · Restricted Cost Information':''),4,20);
 const match=signed&&String(context.signature||'').match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
 const image=match?{extension:match[1]==='jpeg'?'jpg':'png',bytes:Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))}:null;
 const sheet=`<worksheet xmlns="${ns}" xmlns:r="${rel}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:X${r}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols><col min="1" max="24" width="8.5" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(x=>`<mergeCell ref="${x}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${image?'<drawing r:id="signature"/>':''}</worksheet>`;
 const fonts=[['9',false],['9',true],['18',true]].map(([size,bold])=>`<font>${bold?'<b/>':''}<sz val="${size}"/><color rgb="FF000000"/><name val="Tahoma"/></font>`).join('');
 const xf=(font,border=0,format=0,align='left')=>`<xf numFmtId="${format}" fontId="${font}" fillId="0" borderId="${border}" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${align}" vertical="top" wrapText="1"/></xf>`;
 const styles=`<styleSheet xmlns="${ns}"><fonts count="3">${fonts}</fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="6"><border/><border><bottom style="thin"><color rgb="FFAAAAAA"/></bottom></border><border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right><top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom></border>${['top','','bottom'].map(edge=>`<border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right>${edge?`<${edge} style="thin"><color rgb="FFCCCCCC"/></${edge}>`:""}</border>`).join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12">${xf(0)+xf(1)+xf(1,0,0,'right')+xf(2,1)+xf(1,1)+xf(0,0,4,'right')+xf(0,2)+xf(2,2,4)+xf(1,3)+xf(2,4,4)+xf(0,5)+xf(0,4)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 return {sheet,styles,lastRow:r,heading,image,signatureRow};
}
export function signatureDrawing(row){return `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>12</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1524000" cy="476250"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Approval signature"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${rel}" r:embed="image"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1524000" cy="476250"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;}
