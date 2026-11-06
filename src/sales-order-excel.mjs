import {salesOrderForm,signatureDrawing} from './sales-order-excel-form.mjs';
import {itemPartNumber} from './item-part-number.mjs';
// Small dependency-free SpreadsheetML export. Text is always inlineStr, never a formula.
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml=v=>String(v??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const num=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v))?{date:(Date.parse(v)-Date.UTC(1899,11,30))/86400000}:'';
export function salesOrderSheets(order,approval,lang='th'){
 const t=(th,en)=>lang==='th'?th:en,d=order.delivery_details||{};
 const status={confirmed:t('เปิด SO','Confirmed'),delivered:t('ส่งมอบแล้ว','Delivered'),completed:t('ปิดงาน','Completed'),cancelled:t('ยกเลิก','Cancelled')};
 const review={pending:t('รออนุมัติ','Pending'),approved:t('อนุมัติแล้ว','Approved'),rejected:t('ไม่อนุมัติ','Rejected')};
 const rows=[['KC CuTo CRM',t('ใบสั่งขาย','Sales Order')],
 [t('เลขที่ SO','SO number'),order.code],[t('สถานะ SO','SO status'),status[order.status]||order.status],
 [t('การอนุมัติ','Approval'),review[approval?.status]||t('ยังไม่ส่งอนุมัติ','Not submitted')],
 [t('ใบเสนอราคา','Quotation'),order.quotation_code],[t('ลูกค้า','Customer'),order.customer_name],
 [t('ที่อยู่','Address'),order.billing_address],[t('เลขผู้เสียภาษี','Tax ID'),String(order.tax_id??'')],
 [t('ฝ่ายขาย','Salesperson'),order.owner_name],[t('เลขที่ PO','PO number'),order.po_number],
 [t('วันที่ PO','PO date'),date(order.po_date)],[t('กำหนดส่งมอบ','Expected delivery'),date(order.expected_delivery_date)],
 [t('เครดิต (วัน)','Payment terms (days)'),num(order.payment_terms)],[t('สกุลเงิน','Currency'),order.currency||'THB'],
 [t('ยอดรวมรายการ','Subtotal'),num(order.subtotal)],[t('ส่วนลดรวม','Total discount'),num(order.discount)],
 ['VAT',num(order.vat)],[t('ยอดรวม','Total'),num(order.total)],
 [t('หัก ณ ที่จ่าย','Withholding tax'),num(order.withholding_tax)],[t('ยอดสุทธิ','Net total'),num(order.net_total??order.total)],
 [t('ประเภทงาน','Order type'),d.order_type],[t('ส่งของให้','Ship to'),d.ship_to_name||order.customer_name],
 [t('สถานที่ส่งของ','Shipping address'),d.shipping_address],[t('เปิดบิล / วางบิลให้','Bill to'),d.bill_to_name||order.customer_name],
 [t('สถานที่วางบิล','Billing location'),d.billing_location||order.billing_address],
 [t('ชื่อผู้รับสินค้า','Recipient'),d.recipient_name],[t('เบอร์ผู้รับสินค้า','Recipient phone'),String(d.recipient_phone??'')],
 [t('มีการติดตั้ง','Installation'),d.installation==='yes'?t('มี','Yes'):d.installation==='no'?t('ไม่มี','No'):''],
 [t('หมายเหตุ','Notes'),order.note],[t('หลักฐานส่งมอบ','Delivery reference'),order.delivery_reference],
 [t('เหตุผลยกเลิก','Cancellation reason'),order.cancellation_reason]];
 const headers=[t('ลำดับ','No.'),t('สินค้า / บริการ','Product / Service'),'Part Number',t('รายละเอียด','Description'),t('จำนวน','Quantity'),t('หน่วย','Unit'),t('ราคาต่อหน่วย','Unit price'),t('ส่วนลดรายการ','Line discount'),t('ยอดรายการ','Line total'),t('จำนวนรอบ','Cycles'),t('เริ่มบริการ','Service start'),t('สิ้นสุดบริการ','Service end')];
 const items=(order.items||[]).map((v,i)=>[i+1,v.name,itemPartNumber(v),v.desc,num(v.qty),v.unit,num(v.price),num(v.discount),num(v.total),num(v.cycle_count),date(v.service_start),date(v.service_end)]);
 return [{name:t('ใบสั่งขาย','Sales Order'),rows,widths:[30,90]},{name:t('รายการสินค้า','Items'),rows:[headers,...items],widths:[8,36,24,60,14,14,20,20,20,14,18,18],filter:items.length>0}];
}
function zip(files){
 const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
 const header=(size,values)=>{const a=new Uint8Array(size),v=new DataView(a.buffer);for(const [o,n,bits] of values)bits===16?v.setUint16(o,n,true):v.setUint32(o,n,true);return a;};
 for(const [path,text]of Object.entries(files)){
  const name=encoder.encode(path),data=text instanceof Uint8Array?text:encoder.encode(text),sum=crc(data);
  const local=header(30,[[0,0x04034b50],[4,20,16],[12,33,16],[14,sum],[18,data.length],[22,data.length],[26,name.length,16]]);
  const dir=header(46,[[0,0x02014b50],[4,20,16],[6,20,16],[14,33,16],[16,sum],[20,data.length],[24,data.length],[28,name.length,16],[42,offset]]);
  parts.push(local,name,data);central.push(dir,name);offset+=local.length+name.length+data.length;
 }
 const size=central.reduce((s,x)=>s+x.length,0),count=Object.keys(files).length;
 parts.push(...central,header(22,[[0,0x06054b50],[8,count,16],[10,count,16],[12,size],[16,offset]]));
 const out=new Uint8Array(parts.reduce((s,x)=>s+x.length,0));let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;
}
export function salesOrderXlsx(order,approval,lang='th',context={}){
 const sheets=[{name:'Cost Sheet'}],form=salesOrderForm(order,approval,lang,context),types='http://schemas.openxmlformats.org/package/2006/content-types';
 const files={
 '[Content_Types].xml':`<Types xmlns="${types}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
 '_rels/.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
 'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${rel}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
 'xl/styles.xml':form.styles};
 files['xl/worksheets/sheet1.xml']=form.sheet;
 files['xl/workbook.xml']=files['xl/workbook.xml'].replace('</workbook>',`<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Cost Sheet'!$A$1:$X$${form.lastRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'Cost Sheet'!$${form.heading}:$${form.heading}</definedName></definedNames></workbook>`);
 if(form.image){
  const ext=form.image.extension,rels='http://schemas.openxmlformats.org/package/2006/relationships';
  files['[Content_Types].xml']=files['[Content_Types].xml'].replace('</Types>',`<Default Extension="${ext}" ContentType="image/${ext==='jpg'?'jpeg':ext}"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  files['xl/worksheets/_rels/sheet1.xml.rels']=`<Relationships xmlns="${rels}"><Relationship Id="signature" Type="${rel}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  files['xl/drawings/drawing1.xml']=signatureDrawing(form.signatureRow);
  files['xl/drawings/_rels/drawing1.xml.rels']=`<Relationships xmlns="${rels}"><Relationship Id="image" Type="${rel}/image" Target="../media/signature.${ext}"/></Relationships>`;
  files[`xl/media/signature.${ext}`]=form.image.bytes;
 }
 return zip(files);
}
export async function downloadSalesOrderExcel(order,approval,lang,context={}){
 if(approval?.status==='approved'&&/^data:image\/(png|jpeg|webp);base64,/.test(context.signature||'')){
  const img=new Image();img.src=context.signature;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=200;const scale=Math.min(640/img.naturalWidth,200/img.naturalHeight);canvas.getContext('2d').drawImage(img,0,0,img.naturalWidth*scale,img.naturalHeight*scale);context={...context,signature:canvas.toDataURL('image/png')};
 }
 const blob=new Blob([salesOrderXlsx(order,approval,lang,context)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=String(order.code||'Sales-Order').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')+'.xlsx';
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',lang==='th'?'ตรวจทานไฟล์ Excel':'Review Excel file');dialog.style.cssText='width:min(1200px,94vw);height:90dvh;padding:0;border:1px solid #dbe5e9;border-radius:16px;color:#193542;background:white';
 const header=document.createElement('header');header.style.cssText='display:flex;gap:12px;align-items:center;padding:16px;position:sticky;top:0;background:white;border-bottom:1px solid #dbe5e9;z-index:1';const title=document.createElement('strong');title.textContent=a.download;title.style.flex='1';a.textContent=lang==='th'?'ยืนยันดาวน์โหลด Excel':'Download Excel';const close=document.createElement('button');close.type='button';close.textContent=lang==='th'?'ปิด':'Close';close.onclick=()=>dialog.close();header.append(title,a,close);dialog.append(header);
 const note=document.createElement('p');note.textContent=lang==='th'?'ตรวจทานก่อนดาวน์โหลด • รูปแบบและข้อมูลจากชีต Excel จริง':'Review before downloading • Layout and data from the Excel worksheet';note.style.padding='0 16px';dialog.append(note);
 const form=salesOrderForm(order,approval,lang,context),parser=new DOMParser(),doc=parser.parseFromString(form.sheet,'application/xml'),styles=parser.parseFromString(form.styles,'application/xml');
 const table=document.createElement('table');table.style.cssText='border-collapse:collapse;table-layout:fixed;width:1080px;background:white;color:#000;font-family:Tahoma,sans-serif;font-size:12px;box-shadow:0 2px 12px #0002';
 const cg=document.createElement('colgroup');for(let i=0;i<24;i++){const col=document.createElement('col');col.style.width='45px';cg.append(col);}table.append(cg);
 const merges=new Map(),covered=new Set(),coord=s=>{const m=s.match(/^([A-Z]+)([0-9]+)$/);return {c:[...m[1]].reduce((v,ch)=>v*26+ch.charCodeAt(0)-64,0),r:Number(m[2])};};
 for(const merge of doc.getElementsByTagName('mergeCell')){const [start,end]=merge.getAttribute('ref').split(':'),a=coord(start),b=coord(end);merges.set(start,{cols:b.c-a.c+1,rows:b.r-a.r+1});for(let r=a.r;r<=b.r;r++)for(let c=a.c;c<=b.c;c++)if(r!==a.r||c!==a.c)covered.add(c+':'+r);}
 const xfs=[...styles.getElementsByTagName('cellXfs')[0].children],fonts=[...styles.getElementsByTagName('fonts')[0].children],borders=[...styles.getElementsByTagName('borders')[0].children];
 for(const row of doc.getElementsByTagName('row')){const tr=document.createElement('tr');tr.style.height=(Number(row.getAttribute('ht'))*4/3)+'px';for(const cell of row.getElementsByTagName('c')){const ref=cell.getAttribute('r'),pos=coord(ref);if(covered.has(pos.c+':'+pos.r))continue;const td=document.createElement('td'),merge=merges.get(ref);if(merge){td.colSpan=merge.cols;td.rowSpan=merge.rows;}const xf=xfs[Number(cell.getAttribute('s')||0)],font=fonts[Number(xf.getAttribute('fontId')||0)],align=xf.getElementsByTagName('alignment')[0];let value=[...cell.getElementsByTagName('t')].map(n=>n.textContent).join('')||cell.getElementsByTagName('v')[0]?.textContent||'';
 if(xf.getAttribute('numFmtId')==='4'&&value!==''&&Number.isFinite(Number(value)))value=Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});td.textContent=value;td.style.cssText='padding:3px 5px;white-space:pre-wrap;overflow-wrap:anywhere;vertical-align:top';td.style.textAlign=align?.getAttribute('horizontal')||'left';td.style.fontSize=(Number(font.getElementsByTagName('sz')[0]?.getAttribute('val')||9)*4/3)+'px';td.style.fontWeight=font.getElementsByTagName('b').length?'bold':'normal';const border=borders[Number(xf.getAttribute('borderId')||0)];for(const edge of ['top','bottom','left','right'])if(border.getElementsByTagName(edge)[0]?.hasAttribute('style'))td.style['border'+edge[0].toUpperCase()+edge.slice(1)]='1px solid #ccc';
 if(form.image&&Number(row.getAttribute('r'))===form.signatureRow&&pos.c===13){const img=document.createElement('img');img.src=context.signature;img.alt=lang==='th'?'ลายเซ็นผู้อนุมัติ':'Approval signature';img.style.cssText='max-width:160px;max-height:50px';td.append(img);}tr.append(td);}table.append(tr);}const wrap=document.createElement('div');wrap.style.cssText='overflow:auto;padding:16px';wrap.append(table);dialog.append(wrap);dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();

}
