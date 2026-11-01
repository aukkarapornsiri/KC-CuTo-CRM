import {DOCUMENT_BUCKETS,validateRetention,dateBounds} from './document-retention-model.mjs';
import {ACCESS_CHANGED,effectiveRole} from './role-access.mjs';
export function createDocumentRetention({React,client,useApp}){
 const h=React.createElement;
 return function DocumentRetention({lang='th'}){
  const {profile,demoMode}=useApp(),t=(th,en)=>lang==='th'?th:en,allowed=!demoMode&&effectiveRole(profile)&&profile.is_super_admin===true;
  const [from,F]=React.useState(''),[to,T]=React.useState(''),[bucket,B]=React.useState(''),[page,P]=React.useState(0),[preview,V]=React.useState(false),[data,D]=React.useState({rows:[],total:0}),[rules,R]=React.useState([]),[logs,L]=React.useState([]),[busy,S]=React.useState(false),[error,E]=React.useState(''),[revision,U]=React.useState(0),[revoked,X]=React.useState(false);
  React.useEffect(()=>{const invalidate=()=>{X(true);D({rows:[],total:0});R([]);L([]);};window.addEventListener(ACCESS_CHANGED,invalidate);return()=>window.removeEventListener(ACCESS_CHANGED,invalidate);},[]);
  React.useEffect(()=>{X(false);},[profile]);
  React.useEffect(()=>{
   if(!allowed||revoked)return;
   const controller=new AbortController();let live=true;S(true);E('');
   (async()=>{
    const bounds=dateBounds(from,to);
    const results=await Promise.all([
     client.rpc('crm_document_inventory',{...bounds,p_bucket:bucket,p_offset:page*50,p_candidates:preview}).abortSignal(controller.signal),
     client.from('crm_document_retention_rules').select('*').order('bucket_id').abortSignal(controller.signal),
     client.from('crm_document_delete_log').select('id,object_key,bucket_id,source,state,created_at,error').order('created_at',{ascending:false}).limit(20).abortSignal(controller.signal)
    ]);
    for(const result of results)if(result.error)throw result.error;
    if(live){D(results[0].data);R(results[1].data);L(results[2].data);}
   })().catch(e=>{if(live){D({rows:[],total:0});R([]);L([]);E(e.message||String(e));}}).finally(()=>{if(live)S(false);});
   return()=>{live=false;controller.abort();};
  },[allowed,revoked,profile?.id,from,to,bucket,page,preview,revision]);
  const action=async fn=>{if(busy)return;S(true);E('');try{await fn();U(x=>x+1);}catch(e){E(e.message||String(e));}finally{S(false);}};
  const btn=(label,onClick,disabled=false)=>h('button',{type:'button',onClick,disabled:busy||disabled},label);
  const field=(label,type,value,set,props={})=>h('label',{className:'crm-field'},h('span',null,label),h('input',{type,value,disabled:busy,onChange:e=>set(e.target.value),...props}));
  if(!allowed||revoked)return h('section',{className:'crm-settings'},h('h1',null,t('จัดการเอกสารและลบอัตโนมัติ','Documents & Auto Deletion')),h('p',{role:'alert'},t('เฉพาะ Super Admin ที่ใช้งานอยู่','Active Super Admin only')));
  const groupLabel=b=>({'crm-documents':t('เอกสารทั่วไป','General Documents'),'crm-sales-orders':t('เอกสาร PO / SO','PO / SO Documents'),'crm-quotation-assets':t('รูปและลายเซ็นใบเสนอราคา','Quotation Images & Signatures')}[b]||b);
  const stateLabel=s=>({deleting:t('กำลังลบ','Deleting'),failed:t('ลบไม่สำเร็จ','Failed'),deleted:t('ลบแล้ว','Deleted')}[s]||s);
  const save=rule=>action(async()=>{
   const value=validateRetention(rule);
   if(value.enabled&&!window.confirm(t('เปิดลบถาวรอัตโนมัติเฉพาะไฟล์ที่ไม่มีรายการอ้างอิง ตามอายุเก็บและเวลาที่เลือก?','Enable permanent automatic deletion of unreferenced files at the selected retention and hour?')))return;
   const {error}=await client.rpc('crm_document_retention_save',{p_bucket:value.bucket_id,p_days:value.retention_days,p_hour:value.run_hour,p_enabled:value.enabled});if(error)throw error;
  });
  const remove=row=>action(async()=>{
   if(!window.confirm(t('ลบไฟล์นี้ถาวร? ไม่สามารถกู้คืนจากหน้านี้ได้: ','Permanently delete this file? This page cannot restore it: ')+row.name))return;
   const {data,error}=await client.functions.invoke('crm-document-retention',{body:{action:'delete',object_id:row.id,confirm:true}});if(error||data?.error)throw error||Error(data.error);
  });
  return h('section',{className:'crm-settings'},h('h1',null,t('จัดการเอกสารและลบอัตโนมัติ','Documents & Auto Deletion')),
   h('p',null,t('รวมไฟล์เอกสาร PO และไฟล์ประกอบใบเสนอราคาของ CRM · เรียงล่าสุดก่อน · วันที่และเวลาไทย','CRM documents, PO files and quotation assets · Newest first · Bangkok dates and time')),
   error&&h('p',{role:'alert',className:'crm-error'},error),
   h('div',{className:'crm-actions'},field(t('ตั้งแต่วันที่','From date'),'date',from,v=>{F(v);P(0);}),field(t('ถึงวันที่','To date'),'date',to,v=>{T(v);P(0);}),h('label',{className:'crm-field'},h('span',null,t('กลุ่มเอกสาร','Document group')),h('select',{value:bucket,disabled:busy,onChange:e=>{B(e.target.value);P(0);}},h('option',{value:''},t('ทั้งหมด','All')),...DOCUMENT_BUCKETS.map(b=>h('option',{key:b,value:b},groupLabel(b))))),btn(t(preview?'ดูไฟล์ทั้งหมด':'ดูรายการเข้าเกณฑ์ลบ',preview?'Show all files':'Preview eligible files'),()=>{V(!preview);P(0);}),btn(t('โหลดใหม่','Reload'),()=>U(x=>x+1))),
   h('p',{role:'status'},busy?t('กำลังโหลด…','Loading…'):t('จำนวนไฟล์: ','Files: ')+data.total),
   h('div',{className:'crm-table-scroll'},h('table',{className:'crm-master-table'},h('thead',null,h('tr',null,...[t('วันที่อัปโหลด','Uploaded'),t('ชื่อไฟล์','File'),t('กลุ่ม','Group'),t('ขนาด','Size'),t('สถานะ','Status'),t('จัดการ','Actions')].map(x=>h('th',{key:x},x)))),h('tbody',null,...data.rows.map(row=>h('tr',{key:row.id},h('td',null,new Date(row.created_at).toLocaleString(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok'})),h('td',{style:{overflowWrap:'anywhere',maxWidth:340}},row.name),h('td',null,groupLabel(row.bucket_id)),h('td',null,Number(row.metadata?.size||0).toLocaleString()+' B'),h('td',null,row.protected?t('กำลังใช้งาน · ป้องกันการลบ','Referenced · Protected'):stateLabel(row.deletion_state)||t('ไม่มีรายการอ้างอิง','Unreferenced')),h('td',null,btn(t('เปิดไฟล์','Open file'),()=>action(async()=>{const {data,error}=await client.storage.from(row.bucket_id).createSignedUrl(row.name,60);if(error)throw error;const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.rel='noopener';a.click();})),btn(t('ลบถาวร','Delete permanently'),()=>remove(row),row.protected||Date.parse(row.created_at)>Date.now()-86400000))))))),
   h('div',{className:'crm-actions'},btn(t('ก่อนหน้า','Previous'),()=>P(page-1),page===0),h('span',null,String(page+1)),btn(t('ถัดไป','Next'),()=>P(page+1),(page+1)*50>=data.total)),
   h('h2',null,t('ตั้งเวลาลบอัตโนมัติ','Automatic deletion schedule')),h('p',null,t('ลบเฉพาะไฟล์ไม่มีรายการอ้างอิง อายุเก็บขั้นต่ำ 7 วัน ตรวจทุก 5 นาทีในชั่วโมงที่เลือก (เวลาไทย) ไฟล์ที่ผูกกับเอกสารและลายเซ็นได้รับการป้องกัน','Only unreferenced files; minimum 7 days. Checks every 5 minutes during the selected Bangkok hour. Linked documents and signatures are protected.')),
   ...rules.map(rule=>h('section',{key:rule.bucket_id,className:'crm-master-form'},h('h3',null,groupLabel(rule.bucket_id)),h('div',{className:'crm-actions'},field(t('อายุเก็บ (วัน)','Retention (days)'),'number',rule.retention_days,v=>R(old=>old.map(x=>x.bucket_id===rule.bucket_id?{...x,retention_days:v}:x)),{min:7,max:3650}),field(t('ชั่วโมงทำงาน (0–23)','Run hour (0–23)'),'number',rule.run_hour,v=>R(old=>old.map(x=>x.bucket_id===rule.bucket_id?{...x,run_hour:v}:x)),{min:0,max:23}),h('label',null,h('input',{type:'checkbox',checked:rule.enabled,disabled:busy,onChange:e=>R(old=>old.map(x=>x.bucket_id===rule.bucket_id?{...x,enabled:e.target.checked}:x))}),t('เปิดใช้งาน','Enabled')),btn(t('บันทึกกฎ','Save rule'),()=>save(rule))))),
   h('h2',null,t('ประวัติการลบล่าสุด','Recent deletion history')),h('div',{className:'crm-table-scroll'},h('table',{className:'crm-master-table'},h('tbody',null,...logs.map(log=>h('tr',{key:log.id},h('td',null,new Date(log.created_at).toLocaleString(lang==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok'})),h('td',{style:{overflowWrap:'anywhere'}},log.object_key),h('td',null,log.source==='scheduled'?t('อัตโนมัติ','Automatic'):t('Super Admin','Super Admin')),h('td',null,stateLabel(log.state)),h('td',null,log.error||'')))))));
 };
}
