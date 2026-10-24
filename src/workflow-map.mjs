import {observeRead,readIdentity} from './read-coordinator.mjs';
export const WORKFLOW_LANES=[
 {id:'customer',label:['ข้อมูลลูกค้า','Customer relationships'],note:['รับลีด → สร้างความสัมพันธ์ผู้ติดต่อและบัญชีลูกค้า','Capture leads → Connect contacts and accounts'],cards:[
 ['leads','all-leads','ลูกค้าเป้าหมาย','Leads','ค้นหา คัดกรอง และมอบหมายลีด','Capture, qualify and assign leads','◎'],
 ['contacts','contact-list','ผู้ติดต่อ','Contacts','บุคคลและผู้มีอำนาจตัดสินใจของลูกค้า','People and decision makers','♧'],
 ['customers','customer-list','บัญชีลูกค้า','Accounts','ศูนย์รวมข้อมูลลูกค้าและประวัติการทำงาน','Customer profiles and relationship history','▦']]},
 {id:'sales',label:['การขาย','Sales'],note:['จากความต้องการ → เสนอราคา → ดูแลสัญญา','From needs → Quotation → Contract lifecycle'],cards:[
 ['opportunities','opp-list','โอกาสการขาย','Opportunities','ติดตามดีลและขั้นตอนการขาย','Track deals and sales stages','◇'],
 ['quotations','quot-list','ใบเสนอราคา','Quotations','จัดทำราคา ขออนุมัติ และดำเนินการขาย','Prepare pricing, approval and sales','▤'],
 ['contracts','con-all','สัญญาและการต่ออายุ','Contracts & Renewals','ดูแลข้อตกลงและโอกาสต่ออายุ','Manage agreements and renewal opportunities','▧']]},
 {id:'service',label:['บริการและกิจกรรม','Service & Activities'],note:['ดูแลสินทรัพย์ → ให้บริการ → ติดตามลูกค้า','Installed base → Service → Customer follow-up'],cards:[
 ['assets','asset-all','สินทรัพย์ลูกค้า','Customer Assets','ข้อมูลสินทรัพย์และระบบที่ติดตั้ง','Assets and installed systems','⬡'],
 ['tickets','tk-all','งานบริการ','Service','รับแจ้งปัญหา มอบหมาย และแก้ไขงาน','Receive, assign and resolve requests','⚒'],
 ['activities','act-timeline','กิจกรรมและงานติดตาม','Activities','โทร นัดหมาย และติดตามได้ทุกขั้นตอน','Calls, meetings and follow-ups across every stage','◷']]}
];
export async function readWorkflowCounts(client,cards,signal,records){
 const counts={};
 // Sequential HEAD requests stay below the shared five-read limit and return no record payloads.
 for(const card of cards){const table=card[0];if(records){counts[table]=(records[table]||[]).length;continue;}
  const {count,error}=await client.from(table).select('id',{count:'exact',head:true}).abortSignal(signal);
  if(error)throw error;if(!Number.isInteger(count))throw Error('Count unavailable');counts[table]=count;
 }return counts;
}
export function createWorkflowMap({React,client,useApp,useAccess,records}){
 const h=React.createElement;
 return function WorkflowMap({lang}){
  const {profile,demoMode,navigate}=useApp(),access=useAccess(),th=lang==='th',t=(a,b)=>th?a:b;
  const cards=WORKFLOW_LANES.flatMap(l=>l.cards).filter(c=>access.can(c[0],'view'));
  const permissionKey=cards.map(c=>c[0]).join(','),identity=readIdentity(profile);
  const [state,setState]=React.useState({data:null,error:null,loading:true}),subscription=React.useRef(null);
  React.useEffect(()=>{setState({data:null,error:null,loading:true});if(!cards.length){setState({data:null,error:null,loading:false});return;}
   const stop=observeRead(client,{key:'workflow-map:'+identity+':'+permissionKey,userId:profile?.id,demo:demoMode,interval:60000,events:['crm-access-changed'],load:async signal=>({counts:await readWorkflowCounts(client,cards,signal,demoMode?records:null),at:new Date().toISOString()})},setState);
   subscription.current=stop;return()=>{subscription.current=null;stop();};
  },[identity,permissionKey,demoMode]);
  const open=c=>{if(!access.can(c[0],'view'))return;window.dispatchEvent(new CustomEvent('kc-crm-section',{detail:null}));navigate(c[0],c[1]);};
  return h('section',{className:'crm-workflow','aria-label':t('แผนผังการทำงาน','Workflow Map')},
   h('header',{className:'crm-workflow-header'},h('div',null,h('span',{className:'crm-workflow-eyebrow'},t('แผนผังการทำงาน','Workflow Map')),h('h1',null,t('จากลูกค้าเป้าหมาย สู่การขายและบริการ','From leads to sales and service')),h('p',null,t('เลือกการ์ดเพื่อเปิดรายการและทำงานต่อในแต่ละส่วน','Select a card to open its records and continue your work'))),
    h('div',{className:'crm-workflow-tools'},h('span',null,demoMode?t('ข้อมูลทดลอง','Demo data'):t('ข้อมูลตามสิทธิ์ของคุณ • ทุกช่วงเวลา','Your accessible records • All time')),state.data&&h('small',null,t('อัปเดต ','Updated ')+new Date(state.data.at).toLocaleString(th?'th-TH':'en-GB')),h('button',{type:'button',disabled:state.loading||!cards.length,onClick:()=>subscription.current?.refresh()},state.loading?t('กำลังโหลด…','Loading…'):t('รีเฟรชข้อมูล','Refresh data')))),
   state.error&&h('p',{role:'alert',className:'crm-workflow-error'},t('โหลดจำนวนรายการไม่สำเร็จ กรุณารีเฟรชข้อมูล','Unable to load counts. Please refresh.')),
   WORKFLOW_LANES.map((lane,i)=>h('section',{key:lane.id,className:'crm-workflow-lane','data-lane':lane.id},h('div',{className:'crm-workflow-lane-title'},h('h2',null,h('span',null,'0'+(i+1)),lane.label[th?0:1]),h('p',null,lane.note[th?0:1])),
    h('div',{className:'crm-workflow-grid'},lane.cards.map(c=>{const allowed=access.can(c[0],'view'),value=!state.error&&state.data?.counts[c[0]];return h('button',{key:c[0],type:'button',className:'crm-workflow-card',disabled:!allowed,onClick:()=>open(c)},h('div',{className:'crm-workflow-card-top'},h('span',{'aria-hidden':true},c[6]),h('span',{'aria-hidden':true},'↗')),h('h3',null,c[th?2:3]),h('p',null,c[th?4:5]),h('div',{className:'crm-workflow-count'},h('strong',null,allowed&&Number.isInteger(value)?value.toLocaleString(th?'th-TH':'en-US'):'—'),h('span',null,allowed?t('รายการ','records'):t('ไม่มีสิทธิ์เข้าถึง','Access restricted'))));})))),
   h('footer',null,h('span',null,t('→ ทิศทางการทำงานและความสัมพันธ์ของข้อมูล','→ Work direction and record relationships')),h('p',null,t('กิจกรรมเชื่อมโยงการติดตามทุกขั้นตอน • การ์ดแสดงจำนวนรายการทั้งหมดที่คุณมีสิทธิ์ดู ไม่ใช่จำนวนที่แปลงต่อกัน และไม่ควรนำมาบวกรวม','Activities support every stage • Counts are accessible records, not conversion totals, and should not be added together.'))));
 };
}
