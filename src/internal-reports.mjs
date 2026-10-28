import {shortSalesName} from './sales-name.mjs';
import {ENTITIES,summarizePipeline} from './internal-model.mjs';
import {recordOptionLabel} from './record-display.mjs';
import {DEMO_RECORDS} from './internal-workspace.mjs?v=20261001-master-popup';
import {toCSV} from './settings-model.mjs';
import {filterReportRows,groupReportRows,reportTone,REPORT_VALUE_KEYS,REPORT_DATE_KEYS} from './report-view-model.mjs?v=20261028-enterprise';

export function createInternalReports({React,client,useApp,TargetSummary}){
 const h=React.createElement;
 function Records({lang,tabs}){
  const {demoMode,profile,navigate}=useApp(),t=(th,en)=>lang==='th'?th:en;
  const [page,Page]=React.useState(0),[query,Query]=React.useState(''),[status,Status]=React.useState('');
  const [entity,Entity]=React.useState('opportunities'),[rows,Rows]=React.useState([]),[error,ErrorText]=React.useState(''),[busy,Busy]=React.useState(false),[owner,Owner]=React.useState(''),[from,From]=React.useState(''),[to,To]=React.useState(''),[group,Group]=React.useState('status'),[refresh,Refresh]=React.useState(0),[canExport,CanExport]=React.useState(false);
  React.useEffect(()=>{let active=true;Busy(true);ErrorText('');Rows([]);CanExport(false);(async()=>{try{let data=[];if(demoMode)data=DEMO_RECORDS[entity]||[];else{for(let page=0;page<20000;page+=500){const r=await client.from(entity).select('*').order('id').range(page,page+499);if(r.error)throw r.error;data.push(...r.data);if(r.data.length<500)break;if(page===19500)throw Error('More than 20,000 rows; use narrower reporting scope');}}let allowed=demoMode||profile?.is_super_admin===true;if(!allowed){const r=await client.from('role_permissions').select('can_export').eq('role_key',profile?.role==='custom'?profile.custom_role_key:profile?.role||'').eq('module',entity).maybeSingle();if(r.error)throw r.error;allowed=!!r.data?.can_export;}if(active){Rows(data);CanExport(allowed);}}catch(e){if(active)ErrorText(e.message);}finally{if(active)Busy(false);}})();return()=>{active=false;};},[entity,demoMode,profile?.id,refresh]);
  const valueKey=REPORT_VALUE_KEYS[entity],dateKey=REPORT_DATE_KEYS[entity]||'created_at';
  const filtered=filterReportRows(rows,{owner,from,to,query,status,dateKey});
  const groups=groupReportRows(filtered,group,valueKey);
  const metric=entity==='opportunities'?summarizePipeline(filtered):null;
  const won=filtered.filter(r=>r.status==='won').length,closed=filtered.filter(r=>['won','lost'].includes(r.status)).length;
  const format=n=>new Intl.NumberFormat(lang==='th'?'th-TH':'en-US',{maximumFractionDigits:2}).format(n);
  const currency=n=>'฿'+format(n);
  const label=(key,value)=>value?recordOptionLabel(entity,key,value,lang):t('ไม่ระบุ','Unspecified');
  const statusLabel=value=>entity==='opportunities'&&lang==='th'?({open:'กำลังดำเนินการ',won:'ชนะการขาย',lost:'แพ้การขาย'}[value]||label('status',value)):label('status',value);
  const badge=(value)=>h('span',{className:'kc-report-badge is-'+reportTone(value)},statusLabel(value));
  const select=(title,value,set,opts)=>h('label',{className:'crm-field'},h('span',null,title),h('select',{'aria-label':title,value,disabled:busy,onChange:e=>set(e.target.value)},opts.map(([v,n])=>h('option',{key:v,value:v},n))));
  const reset=()=>{Owner('');From('');To('');Query('');Status('');Group('status');};
  const changeEntity=value=>{Entity(value);CanExport(false);reset();};
  React.useEffect(()=>Page(0),[entity,owner,from,to,group,query,status,refresh]);
  const pageSize=20,totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)),currentPage=Math.min(page,totalPages-1),start=currentPage*pageSize;
  const groupLabel={status:t('สถานะ','Status'),owner_name:t('ผู้รับผิดชอบ','Owner'),customer_name:t('ลูกค้า','Customer'),stage:t('ขั้นตอนขาย','Stage')}[group];
  const dateLabel={close_date:t('วันที่คาดว่าจะปิดดีล','Expected close date'),end_date:t('วันที่สิ้นสุดสัญญา','Contract end date'),scheduled_at:t('วันที่นัดหมาย','Scheduled date'),created_at:t('วันที่สร้างรายการ','Created date')}[dateKey];
  const metrics=metric?[
   ['count',t('โอกาสทั้งหมด','Total opportunities'),format(metric.count),t('รวมทุกสถานะ','Across all statuses')],
   ['pipeline',t('มูลค่า Pipeline','Open pipeline'),currency(metric.pipeline),t(`จาก ${filtered.length-closed} ดีลที่ยังเปิดอยู่`,`Across ${filtered.length-closed} open deals`)],
   ['weighted',t('มูลค่าถ่วงน้ำหนัก','Weighted pipeline'),currency(metric.weighted),t('มูลค่า × โอกาสชนะ','Value × win probability')],
   ['winRate',t('อัตราชนะ','Win rate'),closed?format(metric.winRate)+'%':'—',t(`ชนะ ${won} จาก ${closed} ดีลที่ปิด`,`${won} won / ${closed} closed deals`)]
  ]:[];
  const openRecord=r=>navigate(entity,{leads:'lead-inbox',customers:'customer-list',contacts:'contact-list',opportunities:'opp-kanban',quotations:'quot-list',contracts:'con-all',assets:'asset-all',tickets:'tk-all',activities:'act-my',documents:'doc-all'}[entity],{recordId:r.id});
  function exportCSV(){
   if(!canExport||busy||error)return;
   const columns=[...new Set(['code',ENTITIES[entity].name,'customer_name','owner_name','status',dateKey,...(valueKey?[valueKey]:[])])];
   const url=URL.createObjectURL(new Blob(['\ufeff'+toCSV(filtered,columns)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='report-'+entity+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const details=r=>h('button',{type:'button',onClick:()=>openRecord(r),'aria-label':t('รายละเอียด','Details')},t('รายละเอียด →','Details →'));
  const recordName=r=>r.customer_name||r.name||r.subject||r.company_name||r[ENTITIES[entity].name]||'—';
  const summary=h('section',{className:'kc-report-panel kc-report-summary'},
   h('div',{className:'kc-report-panel-title'},h('h2',null,metric&&group==='status'?t('ภาพรวมสถานะการขาย','Opportunity status'):t('สรุปตาม','Summary by ')+groupLabel),h('span',null,format(filtered.length)+' '+t('รายการ','records'))),
   h('div',{className:'kc-report-stacked','aria-hidden':true},groups.map(v=>h('span',{key:v.key,className:'is-'+(group==='status'?reportTone(v.key):'neutral'),style:{flexGrow:v.count},title:label(group,v.key)+': '+v.count}))),
   h('div',{className:'kc-report-summary-list'},groups.map(v=>h('div',{key:v.key,className:'kc-report-summary-item'},
    group==='status'?badge(v.key):h('span',{className:'kc-report-badge'},label(group,v.key)),
    h('p',null,format(v.count)+' '+t('รายการ','records')+' · '+format(filtered.length?v.count/filtered.length*100:0)+'%'),
    valueKey&&h('strong',null,currency(v.value))
   ))),
   filtered.length===0&&h('p',{className:'kc-report-empty'},t('ไม่พบข้อมูลตามตัวกรอง','No records match your filters')),
   metric&&h('p',{className:'kc-report-definition'},t('อัตราชนะคำนวณจากดีลที่ปิดแล้วเท่านั้น • สัดส่วนในกราฟคำนวณจากดีลทั้งหมด','Win rate uses closed deals only. Chart percentages use all opportunities.'))
  );
  return h('section',{className:'kc-reports kc-reports-enterprise','aria-busy':busy},
   h('header',{className:'kc-reports-heading'},
    h('div',null,h('small',{className:'kc-report-eyebrow'},'REPORTS & ANALYTICS'),h('h1',null,t('รายงานและการวิเคราะห์','Reports and analytics')),h('p',null,t('เปลี่ยนข้อมูลการขาย ให้เป็นการตัดสินใจที่ชัดเจน','A clear view of your pipeline, performance and next steps.'))),
    h('div',{className:'kc-report-actions'},h('button',{onClick:()=>Refresh(v=>v+1),disabled:busy},t('โหลดใหม่','Reload')),canExport&&h('button',{className:'kc-report-primary',onClick:exportCSV,disabled:busy||!!error},t('ส่งออก CSV','Export CSV')))
   ),tabs,
   error&&h('p',{role:'alert',className:'crm-error'},error),
   h('section',{className:'kc-report-filter-panel'},
    h('div',{className:'kc-report-filters'},
     select(t('ชุดข้อมูล','Dataset'),entity,changeEntity,['leads','customers','contacts','opportunities','quotations','contracts','assets','tickets','activities','documents'].map(k=>[k,ENTITIES[k].title[lang==='th'?0:1]])),
     select(t('ผู้รับผิดชอบ','Owner'),owner,Owner,[['',t('ทุกคน','All owners')],...[...new Set(rows.map(r=>r.owner_name||r.assigned_to_name).filter(Boolean))].map(x=>[x,shortSalesName(x)])]),
     select(t('จัดกลุ่มตาม','Group by'),group,Group,[['status',t('สถานะ','Status')],['owner_name',t('ผู้รับผิดชอบ','Owner')],['customer_name',t('ลูกค้า','Customer')],...(entity==='opportunities'?[['stage',t('ขั้นตอนขาย','Stage')]]:[])]),
     h('fieldset',{className:'kc-report-date-range'},h('legend',null,dateLabel),h('div',null,...[[t('ตั้งแต่วันที่','From date'),from,From],[t('ถึงวันที่','To date'),to,To]].map(([name,value,set],i)=>h('label',{key:name},h('span',{className:'kc-report-sr'},name),h('input',{type:'date','aria-label':name,value,min:i===1?from||undefined:undefined,max:i===0?to||undefined:undefined,disabled:busy,onChange:e=>set(e.target.value)})))))
    ),
    h('div',{className:'kc-report-filter-meta'},h('span',{role:'status'},busy?t('กำลังโหลด…','Loading…'):t(`แสดงผล ${format(filtered.length)} รายการ · ตามสิทธิ์การเข้าถึง`,`${format(filtered.length)} records · Based on your access permissions`)),h('button',{className:'kc-report-text-button',onClick:reset},t('ล้างตัวกรอง','Reset filters')))
   ),
   busy?h('p',{className:'kc-report-empty'},t('กำลังโหลดรายงาน…','Loading report…')):!error&&h(React.Fragment,null,
    metric&&h(React.Fragment,null,
     h('div',{className:'kc-report-metrics'},metrics.map(([key,name,value,note])=>h('div',{key,'data-metric':key,className:'kc-report-metric'+(key==='pipeline'?' is-highlight':'')},h('span',null,name),h('strong',null,value),h('small',null,note)))),
     h('div',{className:'kc-report-supporting'},
      h('div',{className:'kc-report-support'},h('div',null,h('span',null,t('ชนะการขาย','Won deals')),h('small',null,t('มูลค่าดีลที่ชนะ ','Won value ')+currency(metric.won))),h('strong',{'data-metric':'won'},format(won))),
      h('div',{className:'kc-report-support'},h('div',null,h('span',null,t('มูลค่าเฉลี่ยต่อดีลที่ชนะ','Average won deal')),h('small',null,t('เฉลี่ยจากดีลที่ชนะแล้ว','Based on won opportunities'))),h('strong',{'data-metric':'averageDeal'},won?currency(metric.averageDeal):'—'))
     )
    ),summary,
    h('section',{className:'kc-report-panel'},
     h('div',{className:'kc-report-panel-title'},h('h2',null,t('รายการประกอบรายงาน','Supporting records')),h('span',null,format(filtered.length)+' '+t('รายการ','records'))),
     h('div',{className:'kc-report-table-controls'},h('label',{className:'kc-report-search'},h('span',{className:'kc-report-sr'},t('ค้นหารายงาน','Search report')),h('input',{type:'search','aria-label':t('ค้นหารายงาน','Search report'),placeholder:t('ค้นหารหัสหรือชื่อลูกค้า…','Search code or customer…'),value:query,onChange:e=>Query(e.target.value)})),select(t('สถานะ','Status'),status,Status,[['',t('ทุกสถานะ','All statuses')],...[...new Set(rows.map(r=>r.status).filter(Boolean))].map(v=>[v,statusLabel(v)])])),
     h('div',{className:'kc-report-scroll'},h('table',{className:'kc-report-table kc-report-records'},
      h('thead',null,h('tr',null,...[t('รหัส / รายการ','Code / Record'),t('ลูกค้า / บริษัท / ชื่อ','Customer / Company / Name'),...(valueKey?[t('มูลค่า','Value')]:[]),t('สถานะ','Status'),t('การจัดการ','Actions')].map(name=>h('th',{key:name,scope:'col'},name)))),
      h('tbody',null,filtered.slice(start,start+pageSize).map(r=>h('tr',{key:r.id},
       h('td',{className:'kc-report-code'},r.code||r[ENTITIES[entity].name]||'—'),h('td',{className:'kc-report-customer'},recordName(r)),
       valueKey&&h('td',{className:'is-number'},currency(r[valueKey]||0)),h('td',{className:'kc-report-status-cell'},badge(r.status)),h('td',{className:'kc-report-action-cell'},details(r))
      )),!filtered.length&&h('tr',null,h('td',{colSpan:valueKey?5:4,className:'kc-report-empty'},t('ไม่พบข้อมูลตามตัวกรอง','No records match your filters'),h('button',{onClick:reset},t('ล้างตัวกรอง','Reset filters')))))
     )),
     h('footer',{className:'kc-report-pagination'},h('span',null,t('แสดง ','Showing ')+(filtered.length?start+1:0)+'–'+Math.min(start+pageSize,filtered.length)+t(' จาก ',' of ')+format(filtered.length)),h('nav',{'aria-label':t('หน้ารายงาน','Report pages')},h('button',{disabled:currentPage===0,onClick:()=>Page(currentPage-1)},t('ก่อนหน้า','Previous')),h('span',null,(currentPage+1)+' / '+totalPages),h('button',{disabled:currentPage+1>=totalPages,onClick:()=>Page(currentPage+1)},t('ถัดไป','Next'))))
    )
   ),
   h('p',{className:'kc-report-note'},t('คำนวณจากข้อมูลที่คุณมีสิทธิ์เห็น • มูลค่าโอกาสขายไม่ใช่รายได้ทางบัญชี','Computed from records you can access • Opportunity values are not recognized accounting revenue'))
  );
 }
 return function Reports({lang}){
  const [tab,T]=React.useState('records');
  const tabs=h('nav',{className:'kc-report-tabs','aria-label':lang==='th'?'ประเภทรายงาน':'Report type'},h('button',{'aria-pressed':tab==='records',onClick:()=>T('records')},lang==='th'?'รายงานข้อมูล':'Record reports'),h('button',{'aria-pressed':tab==='targets',onClick:()=>T('targets')},lang==='th'?'รายงานเป้ายอดขาย':'Sales target report'));
  return tab==='targets'?h('div',{className:'kc-reports'},tabs,h(TargetSummary,{lang})):h(Records,{lang,tabs});
 };
}
