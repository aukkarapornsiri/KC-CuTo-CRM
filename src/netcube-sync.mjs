export function netcubeRows(rows){
 const headers=['No','ชื่อสินค้า','คุณสมบัติทางเทคนิค','Part Number','ราคา'];
 if(!headers.every((x,i)=>String(rows[0]?.[i]??'').trim()===x))throw Error('ไฟล์ไม่ใช่ Stock Report จาก Netcube');
 let category='';const seen=new Set(),items=[];
 for(const row of rows.slice(1)){
  if(!/^\d+$/.test(String(row[0]??'').trim())){const match=String(row[0]??'').match(/^(.+?)\s*\(\d+ รายการ\)/);if(match)category=match[1].trim();continue;}
  const pn=String(row[3]??'').trim(),name=String(row[1]??'').trim(),raw=row[4];
  const cost=typeof raw==='number'?raw:Number(String(raw??'').replaceAll(',',''));
  if(!pn||!name||raw===null||raw===undefined||String(raw).trim()===''||!Number.isFinite(cost)||cost<0||cost>1e9||Math.abs(cost*100-Math.round(cost*100))>0.00001)throw Error('Part Number ชื่อ หรือราคาต้นทุนไม่ถูกต้อง: '+pn);
  if(seen.has(pn.toUpperCase()))throw Error('Part Number ซ้ำในไฟล์: '+pn);seen.add(pn.toUpperCase());
  const text=v=>String(v??'').trim();
  const spec=[text(row[2]),text(row[5])&&text(row[5])!=='-'?'Free: '+text(row[5]):'',text(row[13])&&text(row[13])!=='-'?'หมายเหตุ: '+text(row[13]):''].filter(Boolean).join('\n');
  items.push({source_id:'excel:'+pn.toUpperCase(),part_number:pn,name,cost:Math.round(cost*100)/100,spec,category});
 }
 if(!items.length||items.length>500)throw Error('รองรับสินค้า 1–500 รายการต่อไฟล์');return items;
}
export async function readNetcubeXlsx(file){
 if(file.size>5*1024*1024)throw Error('ไฟล์ต้องไม่เกิน 5 MB');
 const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('ไฟล์ XLSX ไม่ถูกต้อง');
 const count=v.getUint16(end+10,true),entries=new Map();let pos=v.getUint32(end+16,true),total=0;
 if(count>1000)throw Error('ไฟล์มีข้อมูลมากเกินไป');
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)throw Error('XLSX directory ไม่ถูกต้อง');
  const size=v.getUint32(pos+20,true),raw=v.getUint32(pos+24,true),len=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true);
  total+=raw;if(total>20*1024*1024)throw Error('ข้อมูลในไฟล์มากเกินไป');
  const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+len));
  entries.set(name,{size,raw,method:v.getUint16(pos+10,true),offset:v.getUint32(pos+42,true),flags:v.getUint16(pos+8,true)});pos+=46+len+extra+comment;
 }
 async function xml(name,optional=false){
  const e=entries.get(name);if(!e){if(optional)return null;throw Error('ไม่พบ '+name);}
  if(e.flags&1||e.offset+30>bytes.length||v.getUint32(e.offset,true)!==0x04034b50)throw Error('ไม่รองรับไฟล์เข้ารหัส');
  const start=e.offset+30+v.getUint16(e.offset+26,true)+v.getUint16(e.offset+28,true);if(start+e.size>bytes.length)throw Error('ไฟล์ไม่ครบ');
  let data=bytes.slice(start,start+e.size);
  if(e.method===8){
   const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let n=0;
   for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>e.raw||n>20*1024*1024){await reader.cancel();throw Error('ข้อมูลขยายเกินกำหนด');}chunks.push(value);}
   data=new Uint8Array(n);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  }else if(e.method!==0)throw Error('รูปแบบการบีบอัดไม่รองรับ');
  if(data.length!==e.raw)throw Error('ขนาดข้อมูลไม่ถูกต้อง');
  const text=new TextDecoder().decode(data);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('XML ไม่รองรับ');
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('XML ไม่ถูกต้อง');return doc;
 }
 const strings=await xml('xl/sharedStrings.xml',true),shared=strings?Array.from(strings.getElementsByTagName('si'),x=>Array.from(x.getElementsByTagName('t'),t=>t.textContent).join('')):[];
 const sheet=await xml('xl/worksheets/sheet1.xml');const rows=[];
 for(const row of sheet.getElementsByTagName('row')){
  const cells=[];for(const cell of row.getElementsByTagName('c')){
   if(cell.getElementsByTagName('f').length)throw Error('กรุณาใช้ไฟล์ Export Excel ต้นฉบับที่ไม่มีสูตร');
   const ref=cell.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/)?.[0];if(!letters)throw Error('ตำแหน่งเซลล์ไม่ถูกต้อง');let col=0;for(const c of letters)col=col*26+c.charCodeAt(0)-64;
   const type=cell.getAttribute('t'),raw=cell.getElementsByTagName('v')[0]?.textContent??'';
   cells[col-1]=type==='s'?shared[Number(raw)]:type==='inlineStr'?Array.from(cell.getElementsByTagName('t'),x=>x.textContent).join(''):raw;
  }rows.push(cells);
 }
 return netcubeRows(rows);
}
export function createNetcubeSync({React,client}){
 const h=React.createElement;
 return function NetcubeSync({onClose,onSynced,canCreate}){
  const dialog=React.useRef(null),lock=React.useRef(false),[items,setItems]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[result,setResult]=React.useState(null),[batch,setBatch]=React.useState(null),[confirmed,setConfirmed]=React.useState(false);
  React.useEffect(()=>{dialog.current.showModal();const prev=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=prev;};},[]);
  async function choose(file){if(!file||lock.current)return;lock.current=true;setBusy(true);setError('');setItems(null);setBatch(null);setResult(null);setConfirmed(false);try{const data=await readNetcubeXlsx(file);setItems(data);setBatch({batch_id:'manual-'+crypto.randomUUID(),observed_at:new Date().toISOString(),items:data});}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
  async function sync(){if(lock.current||!batch||!confirmed)return;lock.current=true;setBusy(true);setError('');try{const {data,error}=await client.rpc('crm_netcube_ingest',{p:batch});if(error)throw error;setResult(data);setBatch(null);await onSynced();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
  return h('dialog',{ref:dialog,className:'crm-inventory-dialog','data-kind':'settings','aria-label':'Sync Netcube',onCancel:e=>{e.preventDefault();if(!busy)onClose();}},h('header',null,h('h2',null,'Sync Netcube'),h('button',{type:'button',disabled:busy,onClick:onClose,'aria-label':'ปิด Sync'},'×')),
   h('ol',null,h('li',null,h('a',{href:'https://stock.netcube.co.th/stocks-excel',target:'_blank',rel:'noopener noreferrer'},'เปิด Netcube และยืนยันตัวตน Microsoft')),h('li',null,'ล้างตัวกรอง แล้วกด Export Excel เพื่อดาวน์โหลดข้อมูลล่าสุด'),h('li',null,'เลือกไฟล์ที่เพิ่งดาวน์โหลด แล้วกด Sync')),
   h('p',null,'ต้นทุนไม่รวม VAT • อัปเดตสเปคและ Part Number • ไม่แก้ราคาขายในใบเสนอราคาและยอดสต็อก'),
   !canCreate&&h('p',null,'บัญชีนี้ไม่มีสิทธิ์เพิ่มสินค้า หากพบสินค้าใหม่ระบบจะไม่บันทึกทั้งรอบ'),
   h('label',null,'ไฟล์ Stock Report (.xlsx)',h('input',{type:'file',accept:'.xlsx',disabled:busy,onChange:e=>choose(e.target.files[0])})),
   items&&h('p',null,'ตรวจไฟล์ผ่าน: '+items.length+' รายการ'),
   items&&!result&&h('label',null,h('input',{type:'checkbox',checked:confirmed,disabled:busy,onChange:e=>setConfirmed(e.target.checked)}),' ยืนยันว่าเป็นไฟล์ล่าสุดที่เพิ่ง Export จาก Netcube ราคาคือต้นทุนไม่รวม VAT'),
   h('p',null,'ไฟล์ Excel ใช้ Part Number จับคู่สินค้า หากต้นทางเปลี่ยน Part Number ให้ตรวจและจับคู่รายการเดิมก่อน เพื่อไม่เพิ่มสินค้าใหม่ซ้ำ'),
   error&&h('p',{role:'alert',className:'crm-error'},error),result&&h('p',{role:'status',className:'crm-notice'},`Sync สำเร็จ: เพิ่ม ${result.created} · แก้ไข ${result.updated} · ไม่เปลี่ยน ${result.unchanged} · แจ้งเตือน ${result.notifications}`),
   h('footer',null,h('button',{type:'button',disabled:busy,onClick:onClose},'ปิด'),h('button',{type:'button',className:'crm-save',disabled:busy||!batch||!confirmed,onClick:sync},busy?'กำลังดำเนินการ…':'Sync ข้อมูล')));
 };
}
