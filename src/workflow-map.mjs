import {createSalesOrders} from './sales-orders.mjs';
import {observeRead,readIdentity} from './read-coordinator.mjs';
export const WORKFLOW_LANES=[
 {id:'customer',label:['ข้อมูลลูกค้า','Customer relationships'],note:['รับลีด → สร้างความสัมพันธ์ผู้ติดต่อและบัญชีลูกค้า','Capture leads → Connect contacts and accounts'],cards:[
 ['leads','all-leads','ลูกค้าเป้าหมาย','Leads','ค้นหา คัดกรอง และมอบหมายลีด','Capture, qualify and assign leads','◎'],
 ['contacts','contact-list','ผู้ติดต่อ','Contacts','บุคคลและผู้มีอำนาจตัดสินใจของลูกค้า','People and decision makers','♧'],
 ['customers','customer-list','บัญชีลูกค้า','Accounts','ศูนย์รวมข้อมูลลูกค้าและประวัติการทำงาน','Customer profiles and relationship history','▦']]},
 {id:'sales',label:['การขาย','Sales'],note:['จากความต้องการ → เสนอราคา → SO → ดูแลสัญญา','From needs → Quotation → SO → Contract lifecycle'],cards:[
 ['opportunities','opp-list','โอกาสการขาย','Opportunities','ติดตามดีลและขั้นตอนการขาย','Track deals and sales stages','◇'],
 ['quotations','quot-list','ใบเสนอราคา','Quotations','จัดทำราคา ขออนุมัติ และดำเนินการขาย','Prepare pricing, approval and sales','▤'],
 ['sales_orders','quot-list','ใบสั่งขาย (SO)','Sales Orders (SO)','รับ PO อนุมัติ SO และติดตามการส่งมอบ','Receive PO, approve SO and track delivery','▣'],
 ['contracts','con-all','สัญญาและการต่ออายุ','Contracts & Renewals','ดูแลข้อตกลงและโอกาสต่ออายุ','Manage agreements and renewal opportunities','▧']]},
 {id:'service',label:['บริการและกิจกรรม','Service & Activities'],note:['ดูแลสินทรัพย์ → ให้บริการ → ติดตามลูกค้า','Installed base → Service → Customer follow-up'],cards:[
 ['assets','asset-all','สินค้าและคลัง','Products & Inventory','ข้อมูลสินทรัพย์และระบบที่ติดตั้ง','Assets and installed systems','⬡'],
 ['tickets','tk-all','งานบริการ','Service','รับแจ้งปัญหา มอบหมาย และแก้ไขงาน','Receive, assign and resolve requests','⚒'],
 ['activities','act-timeline','กิจกรรมและงานติดตาม','Activities','โทร นัดหมาย และติดตามได้ทุกขั้นตอน','Calls, meetings and follow-ups across every stage','◷']]}
];
// Explicit overview relationships; arrows do not create or convert records.
export const WORKFLOW_LINKS=[
 ['leads','contacts','ข้อมูลผู้ติดต่อ','Contact details'],
 ['contacts','customers','เชื่อมบัญชีลูกค้า','Link account'],
 ['customers','opportunities','เปิดโอกาสการขาย','Open opportunity'],
 ['opportunities','quotations','เสนอราคา','Prepare quotation'],
 ['quotations','sales_orders','เปิดใบสั่งขาย','Convert Sales Order'],
 ['sales_orders','contracts','ข้อตกลงการขาย','Sales agreement'],
 ['contracts','assets','สินทรัพย์ที่ดูแล','Covered assets'],
 ['assets','tickets','แจ้งบริการ','Service request'],
 ['tickets','activities','ติดตามผล','Follow up']
];
export function workflowPath(a,b,boardWidth,mobile=false,turnY=0,laneChange=false){
 if(mobile&&laneChange)return `M ${a.x+a.width/2} ${a.y+a.height} L ${a.x+a.width/2} ${a.y+a.height+14} L ${boardWidth-5} ${a.y+a.height+14} L ${boardWidth-5} ${b.y-15} L ${b.x+b.width/2} ${b.y-15} L ${b.x+b.width/2} ${b.y-5}`;
 if(mobile)return `M ${a.x+a.width/2} ${a.y+a.height} L ${b.x+b.width/2} ${b.y-5}`;
 const sy=a.y+a.height/2,ey=b.y+b.height/2;
 if(Math.abs(a.y-b.y)<8)return `M ${a.x+a.width} ${sy} L ${b.x-5} ${ey}`;
 const right=boardWidth-5,left=5;
 return `M ${a.x+a.width} ${sy} L ${right} ${sy} L ${right} ${turnY} L ${left} ${turnY} L ${left} ${ey} L ${b.x-5} ${ey}`;
}
export const workflowSource=id=>id==='sales_orders'?{module:'quotations',table:'crm_sales_orders',demo:'native_sales_orders'}:{module:id,table:id,demo:id};
export async function readWorkflowCounts(client,cards,signal,records){
 const counts={};
 // Sequential HEAD requests stay below the shared five-read limit and return no record payloads.
 for(const card of cards){const table=card[0],source=workflowSource(table);if(records){counts[table]=(records[source.demo]||[]).length;continue;}
  const {count,error}=await client.from(source.table).select('id',{count:'exact',head:true}).abortSignal(signal);
  if(error)throw error;if(!Number.isInteger(count))throw Error('Count unavailable');counts[table]=count;
 }return counts;
}
export function createWorkflowMap({React,client,useApp,useAccess,records}){
 const h=React.createElement,SalesOrders=createSalesOrders({React,client,useApp,useAccess,records});
 return function WorkflowMap({lang}){
  const {profile,demoMode,navigate}=useApp(),access=useAccess(),th=lang==='th',t=(a,b)=>th?a:b;
  const cards=WORKFLOW_LANES.flatMap(l=>l.cards).filter(c=>access.can(workflowSource(c[0]).module,'view'));
  const permissionKey=cards.map(c=>c[0]).join(','),identity=readIdentity(profile);
  const board=React.useRef(null),[links,setLinks]=React.useState([]),[paused,setPaused]=React.useState(false),[active,setActive]=React.useState(null),[showSO,setShowSO]=React.useState(false);
  const svgId=React.useId().replace(/:/g,'');
  React.useLayoutEffect(()=>{
   const root=board.current;if(!root)return;
   let frame;
   const measure=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
    const box=root.getBoundingClientRect(),mobile=window.matchMedia('(max-width:900px)').matches;
    const rect=id=>{const el=root.querySelector(`[data-flow-node="${id}"]`);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.left-box.left,y:r.top-box.top,width:r.width,height:r.height,el};};
    setLinks(WORKFLOW_LINKS.map(([from,to,thLabel,enLabel])=>{const a=rect(from),b=rect(to);if(!a||!b)return null;
     const cross=Math.abs(a.y-b.y)>8,heading=b.el.closest('.crm-workflow-lane').getBoundingClientRect();
     const turnY=heading.top-box.top-18;
     return {from,to,label:th?thLabel:enLabel,d:workflowPath(a,b,box.width,mobile,turnY,a.el.closest('.crm-workflow-lane')!==b.el.closest('.crm-workflow-lane')),cross:cross&&!mobile,
      labelX:box.width/2,labelY:turnY-7};
    }).filter(Boolean));
   });};
   const observer=new ResizeObserver(measure);observer.observe(root);root.querySelectorAll('[data-flow-node]').forEach(el=>observer.observe(el));
   measure();window.addEventListener('resize',measure);return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',measure);};
  },[lang]);
  const [state,setState]=React.useState({data:null,error:null,loading:true}),subscription=React.useRef(null);
  React.useEffect(()=>{setState({data:null,error:null,loading:true});if(!cards.length){setState({data:null,error:null,loading:false});return;}
   const stop=observeRead(client,{key:'workflow-map:'+identity+':'+permissionKey,userId:profile?.id,demo:demoMode,interval:60000,events:['crm-access-changed'],load:async signal=>({counts:await readWorkflowCounts(client,cards,signal,demoMode?records:null),at:new Date().toISOString()})},setState);
   subscription.current=stop;return()=>{subscription.current=null;stop();};
  },[identity,permissionKey,demoMode]);
  const open=c=>{if(!access.can(workflowSource(c[0]).module,'view'))return;if(c[0]==='sales_orders'){setShowSO(true);return;}window.dispatchEvent(new CustomEvent('kc-crm-section',{detail:null}));navigate(c[0],c[1]);};
  return h('section',{className:'crm-workflow','aria-label':t('แผนผังการทำงาน','Workflow Map')},
   h('header',{className:'crm-workflow-header'},h('div',null,h('span',{className:'crm-workflow-eyebrow'},t('แผนผังการทำงาน','Workflow Map')),h('h1',null,t('จากลูกค้าเป้าหมาย สู่การขายและบริการ','From leads to sales and service')),h('p',null,t('เลือกการ์ดเพื่อเปิดรายการและทำงานต่อในแต่ละส่วน','Select a card to open its records and continue your work'))),
    h('div',{className:'crm-workflow-tools'},h('span',null,demoMode?t('ข้อมูลทดลอง','Demo data'):t('ข้อมูลตามสิทธิ์ของคุณ • ทุกช่วงเวลา','Your accessible records • All time')),state.data&&h('small',null,t('อัปเดต ','Updated ')+new Date(state.data.at).toLocaleString(th?'th-TH':'en-GB')),h('button',{type:'button',disabled:state.loading||!cards.length,onClick:()=>subscription.current?.refresh()},state.loading?t('กำลังโหลด…','Loading…'):t('รีเฟรชข้อมูล','Refresh data')),h('button',{type:'button','aria-pressed':paused,onClick:()=>setPaused(v=>!v)},paused?t('เล่นลูกศร','Play arrows'):t('หยุดลูกศร','Pause arrows')))),
   state.error&&h('p',{role:'alert',className:'crm-workflow-error'},t('โหลดจำนวนรายการไม่สำเร็จ กรุณารีเฟรชข้อมูล','Unable to load counts. Please refresh.')),
   h('div',{className:'crm-workflow-board',ref:board,'data-paused':paused},
    h('svg',{className:'crm-workflow-connections','aria-hidden':true},
     h('defs',null,...['customer','sales','service'].map((id,i)=>h('marker',{key:id,id:svgId+id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'},h('path',{d:'M 1 1 L 9 5 L 1 9 Z',fill:['#23d5ce','#b59aff','#67baff'][i]})))),
     links.map((link,i)=>{const tone=WORKFLOW_LANES.find(l=>l.cards.some(c=>c[0]===link.to)).id,color={customer:'#23d5ce',sales:'#b59aff',service:'#67baff'}[tone];
      return h('g',{key:link.from+'-'+link.to,'data-dimmed':active&&active!==link.from&&active!==link.to?'true':undefined},
       h('path',{d:link.d,fill:'none',stroke:color,strokeWidth:1.6,opacity:.8,strokeLinejoin:'round',markerEnd:`url(#${svgId+tone})`}),
       h('path',{className:'crm-flow-motion',d:link.d,fill:'none',stroke:color,strokeWidth:3,strokeDasharray:'5 18',strokeLinecap:'round'}),
       link.cross&&h('text',{x:link.labelX,y:link.labelY,textAnchor:'middle',fill:color},link.label));
     })),
   WORKFLOW_LANES.map((lane,i)=>h('section',{key:lane.id,className:'crm-workflow-lane','data-lane':lane.id},h('div',{className:'crm-workflow-lane-title'},h('h2',null,h('span',null,'0'+(i+1)),lane.label[th?0:1]),h('p',null,lane.note[th?0:1])),
    h('div',{className:'crm-workflow-grid',style:{'--flow-columns':lane.cards.length}},lane.cards.map(c=>{const allowed=access.can(workflowSource(c[0]).module,'view'),value=!state.error&&state.data?.counts[c[0]];return h('button',{key:c[0],type:'button',className:'crm-workflow-card','data-flow-node':c[0],onMouseEnter:()=>setActive(c[0]),onMouseLeave:()=>setActive(null),onFocus:()=>setActive(c[0]),onBlur:()=>setActive(null),disabled:!allowed,onClick:()=>open(c)},h('div',{className:'crm-workflow-card-top'},h('span',{'aria-hidden':true},c[6]),h('span',{className:'crm-workflow-step'},String(WORKFLOW_LANES.slice(0,i).reduce((n,l)=>n+l.cards.length,0)+lane.cards.indexOf(c)+1).padStart(2,'0'))),h('h3',null,c[th?2:3]),h('p',null,c[th?4:5]),h('div',{className:'crm-workflow-count'},h('strong',null,allowed&&Number.isInteger(value)?value.toLocaleString(th?'th-TH':'en-US'):'—'),h('span',null,allowed?t('รายการ','records'):t('ไม่มีสิทธิ์เข้าถึง','Access restricted'))));}))))),
   showSO&&h(SalesOrders,{lang,onClose:()=>setShowSO(false),onQuotation:id=>{setShowSO(false);navigate('quotations','quot-list',{recordId:id});}}),
   h('footer',null,h('span',null,t('→ จุดวิ่งและหัวลูกศรแสดงทิศทางจากต้นทางไปปลายทาง','→ Moving dashes and arrowheads show source → destination')),h('p',null,t('เส้นแสดงความเชื่อมโยงของงาน ไม่ใช่การสร้างรายการอัตโนมัติ • กิจกรรมใช้ติดตามได้ทุกขั้นตอน • การ์ดแสดงจำนวนรายการทั้งหมดที่คุณมีสิทธิ์ดู ไม่ใช่จำนวนที่แปลงต่อกัน และไม่ควรนำมาบวกรวม','Links show work relationships, not automatic record creation • Activities support every stage • Counts are accessible records, not conversion totals, and should not be added together.'))));
 };
}
