import {analytics,filterTickets,isClosed,sla,day,STATUSES,STATUS_LABELS} from './service-model.mjs?v=20261001-service';

export function overviewData(rows,data,filters,now){
 const visible=filterTickets(rows,filters,now),ids=new Set(visible.map(t=>t.id));
 const summary=analytics(visible,(data.service_repairs||[]).filter(r=>ids.has(r.ticket_id)),(data.service_claims||[]).filter(r=>ids.has(r.ticket_id)),now);
 summary.repairCost+=(data.service_parts||[]).filter(r=>ids.has(r.ticket_id)).reduce((n,r)=>n+Number(r.quantity)*Number(r.unit_cost),0);
 const active=visible.filter(t=>!isClosed(t)),counts=new Map();
 visible.forEach(t=>{if(t.asset_id)counts.set(t.asset_id,(counts.get(t.asset_id)||0)+1);});
 const rank=t=>({breached:0,warning:1}[sla(t,now).status]??(!t.assigned_to_id?2:3));
 const due=t=>{const s=sla(t,now);return Math.min(s.resolution??Infinity,t.first_response_at?Infinity:s.response??Infinity);};
 const queue=[...active].sort((a,b)=>rank(a)-rank(b)||due(a)-due(b)||String(a.created_at).localeCompare(String(b.created_at))).slice(0,5);
 return {visible,summary,active,queue,repeated:[...counts.values()].filter(n=>n>1).length,count:key=>filterTickets(visible,{kpi:key},now).length};
}

export function createServiceOverview(React){
 const h=React.createElement;
 return function ServiceOverview({rows,data,filters,onFilters,now,lang,button,drill,onOpen,onCreate,canCreate}){
 const th=lang==='th',t=(a,b)=>th?a:b,{visible,summary:s,active,queue,repeated,count}=overviewData(rows,data,filters,now);
 const number=n=>Number(n).toLocaleString(th?'th-TH':'en-US',{maximumFractionDigits:1}),metric=(v,unit='')=>v==null?'—':number(v)+unit;
 const go=f=>drill({...filters,...f}),today=day(now),month=today.slice(0,7);
 const period=filters.from===today?'today':filters.month===month?'month':'all';
 const title=(label,action)=>h('div',{className:'svc-overview-title'},h('h2',null,label),action);
 const mini=(label,value,hint)=>h('div',{className:'svc-overview-mini',key:label},h('span',null,label),h('strong',null,value),h('small',null,hint));
 const slaLabel=ticket=>{const status=sla(ticket,now).status;return t({breached:'เกิน SLA',warning:'ใกล้ครบ SLA',paused:'หยุดนับชั่วคราว','on-track':'อยู่ในกำหนด',unknown:'ยังไม่กำหนด SLA'}[status],{breached:'SLA overdue',warning:'SLA at risk',paused:'SLA paused','on-track':'On track',unknown:'No SLA set'}[status]);};
 return h('div',{className:'svc-overview','data-service-overview':true},
 h('div',{className:'svc-overview-filters'},h('div',null,
 h('label',null,h('span',{className:'svc-overview-sr'},t('ช่วงเวลา','Period')),h('select',{'aria-label':t('ช่วงเวลา','Period'),value:period,onChange:e=>{const next={...filters};delete next.from;delete next.to;delete next.month;if(e.target.value==='today')next.from=today;if(e.target.value==='month')next.month=month;onFilters(next);}},h('option',{value:'all'},t('ทุกช่วงเวลา','All time')),h('option',{value:'month'},t('เปิดในเดือนนี้','Opened this month')),h('option',{value:'today'},t('เปิดวันนี้','Opened today')))),
 h('label',null,h('span',{className:'svc-overview-sr'},t('ทีมบริการ','Service team')),h('select',{'aria-label':t('ทีมบริการ','Service team'),value:filters.team_id||'',onChange:e=>onFilters({...filters,team_id:e.target.value})},h('option',{value:''},t('ทุกทีมบริการ','All service teams')),(data.service_teams||[]).map(team=>h('option',{key:team.id,value:team.id},team.name)))),
 h('span',{className:'svc-overview-date'},new Intl.DateTimeFormat(th?'th-TH':'en-GB',{dateStyle:'medium',timeZone:'Asia/Bangkok'}).format(now))),h('span',{className:'svc-overview-context'},t('ข้อมูลตามสิทธิ์การเข้าถึง','Based on your access permissions'))),
 h('div',{className:'svc-overview-kpis'},[
 ['open',t('เคสที่เปิดอยู่','Open cases'),t(`เปิดใหม่วันนี้ ${count('today')} เคส`,`${count('today')} new today`)],
 ['unassigned',t('รอมอบหมาย','Unassigned'),t('จัดสรรงานให้ทีมบริการ','Assign work to your service team')],
 ['breached',t('SLA เกินกำหนด','SLA overdue'),t('ตรวจสอบเคสที่เกินกำหนด','Review overdue cases')],
 ['finished',t('เสร็จสิ้นวันนี้','Resolved today'),t('เคสที่บันทึกการแก้ไขวันนี้','Cases resolved today')]
 ].map(([key,label,hint])=>button(h(React.Fragment,null,h('span',null,label),h('strong',null,number(count(key))),h('small',null,hint)),()=>go({kpi:key}),{key,className:`svc-overview-kpi ${key}`,'data-kpi':key}))),
 count('warning')>0&&h('div',{className:'svc-overview-warning'},h('span',null,t(`${count('warning')} เคสใกล้ครบ SLA · ตรวจสอบก่อนเกินกำหนด`,`${count('warning')} cases approaching SLA · Review before they become overdue`)),button(t('ดูเคสที่เสี่ยง →','View at-risk cases →'),()=>go({kpi:'warning'}),{'data-kpi':'warning'})),
 !visible.length?h('section',{className:'svc-overview-panel svc-overview-empty'},h('span',{className:'svc-overview-pill'},t('พร้อมเริ่มต้น','Ready when you are')),h('h2',null,rows.length?t('ไม่พบเคสในตัวกรองนี้','No cases match these filters'):t('ทุกงานบริการ เริ่มจากเคสแรก','Great service starts with your first case')),h('p',null,t('สร้างคำร้องเพื่อเชื่อมโยงลูกค้า อุปกรณ์ และกำหนดเวลา SLA','Connect your customer, equipment and SLA in one service case')),rows.length?button(t('ล้างตัวกรอง','Clear filters'),()=>onFilters({})):canCreate&&button(t('+ สร้างเคสแรก','+ Create first case'),onCreate,{className:'primary'})):
 h('div',{className:'svc-overview-work'},h('section',{className:'svc-overview-panel'},title(t('งานที่ต้องดูแลก่อน','Needs attention'),button(t('ดูคำร้องทั้งหมด →','View all cases →'),()=>go({}))),h('p',{className:'svc-overview-note'},t('เรียงตามความเสี่ยง SLA การมอบหมาย และเวลาที่เหลือ','Sorted by SLA risk, assignment and time remaining')),
 h('div',{className:'svc-overview-queue-head'},h('span',null,t('คำร้อง / ลูกค้า','Case / Customer')),h('span',null,t('สถานะ SLA','SLA status')),h('span',null,t('ผู้รับผิดชอบ','Assigned to'))),
 queue.length?queue.map(ticket=>button(h(React.Fragment,null,h('span',{className:'svc-overview-identity'},h('small',null,ticket.code),h('strong',null,ticket.subject),h('span',null,ticket.customer_name||'—')),h('span',null,h('span',{className:`svc-badge ${sla(ticket,now).status}`},slaLabel(ticket))),h('span',{className:'svc-overview-owner'},ticket.assigned_to_name||(data.service_teams||[]).find(team=>team.id===ticket.team_id)?.name||t('ยังไม่มอบหมาย','Unassigned'))),()=>onOpen(ticket.id),{key:ticket.id,className:'svc-overview-case','aria-label':t(`เปิดเคส ${ticket.code}`,`Open case ${ticket.code}`)})):h('p',null,t('ไม่มีเคสที่เปิดอยู่','No open cases'))),
 h('section',{className:'svc-overview-panel'},title(t('สถานะงานบริการ','Service status'),h('small',null,t(`${active.length} เคส`,`${active.length} cases`))),h('p',{className:'svc-overview-note'},t('งานที่เปิดอยู่ แยกตามสถานะ','Open work by status')),h('div',{className:'svc-overview-status'},STATUSES.filter(status=>active.some(x=>x.status===status)).map((status,i)=>{const n=active.filter(x=>x.status===status).length;return button(h(React.Fragment,null,h('span',null,th?STATUS_LABELS[status]:status.replaceAll('-',' '),h('strong',null,n)),h('span',{className:'svc-overview-track'},h('i',{style:{width:`${100*n/active.length}%`,background:['#4c6cc1','#008c88','#ac6709','#647b89'][i%4]}}))),()=>go({status,kpi:'open'}),{key:status});})),!active.length&&h('p',null,t('ไม่มีเคสที่เปิดอยู่','No open cases')))),
 h('section',{className:'svc-overview-panel'},title(t('คุณภาพการให้บริการ','Service performance'),h('small',null,t('วัดจากเคสที่มีข้อมูลบันทึกแล้ว','Based on recorded case data'))),h('div',{className:'svc-overview-performance'},
 mini(t('รักษา SLA','SLA compliance'),metric(s.compliance,'%'),t('เคสที่แก้ไขภายในกำหนด','Resolved within SLA')),
 mini(t('ตอบกลับเฉลี่ย','Average response'),metric(s.response,t(' นาที',' min')),t('เริ่มรับงานหลังเปิดเคส','From case creation to response')),
 mini(t('แก้ไขเฉลี่ย','Average resolution'),s.resolution==null?'—':metric(s.resolution/60,t(' ชม.',' hr')),t('ตามเวลาปฏิทิน SLA','Using the SLA calendar')),
 mini(t('แก้ไขได้ครั้งแรก','First-time fix'),metric(s.firstFix,'%'),t('จากผลการแก้ไขที่บันทึกไว้','From recorded first-time fix outcomes')))),
 h('div',{className:'svc-overview-bottom'},
 h('section',{className:'svc-overview-panel'},mini(t('ความพึงพอใจลูกค้า','Customer satisfaction'),metric(s.csat,' / 5'),t(`จากแบบประเมิน ${visible.filter(x=>x.csat).length} รายการ`,`${visible.filter(x=>x.csat).length} ratings`))),
 h('section',{className:'svc-overview-panel'},mini(t('ค่าใช้จ่ายงานซ่อม','Repair costs'),'฿'+number(s.repairCost),t('งานเคลม ฿','Claim costs ฿')+number(s.claimCost))),
 h('section',{className:'svc-overview-panel'},mini(t('อุปกรณ์แจ้งซ้ำ','Assets with repeat incidents'),number(repeated),t('อุปกรณ์ที่มีมากกว่าหนึ่งเคสในช่วงที่เลือก','Assets with multiple cases in this period')))),
 h('p',{className:'svc-overview-note'},t('0 = ไม่มีรายการ · — = ยังไม่มีข้อมูลสำหรับคำนวณ · ตัวกรองช่วงเวลาใช้วันที่เปิดเคส','0 = No records · — = Insufficient data · Period filters use the case creation date')));
 };
}
