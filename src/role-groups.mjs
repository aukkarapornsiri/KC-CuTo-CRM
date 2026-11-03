export const ROLE_GROUPS=[
 ['admin','ผู้ดูแลระบบ','Administration'],['management','ผู้บริหารและผู้จัดการ','Leadership & management'],['sales','ฝ่ายขายและการตลาด','Sales & marketing'],['service','บริการและสนับสนุนเทคนิค','Service & technical support'],['solutions','โซลูชันและพัฒนาซอฟต์แวร์','Solutions & software development'],['operations','บัญชี จัดซื้อ และคลังสินค้า','Finance, purchasing & inventory'],['general','ผู้ใช้งานทั่วไป / อ่านอย่างเดียว','General & read-only users']
];
export function roleGroup(role){
 const key=role.role_key||'',label=[role.label_th,role.label_en].join(' ');
 if(['account_manager','key_account_manager'].includes(key))return 'sales';
 if(/^(admin|super_admin|system_admin|it_admin|administrator)$/.test(key)||/ผู้ดูแลระบบ|administrator/i.test(label))return 'admin';
 if(/finance|credit_control|accountant|accounting|procure|purchas|warehouse|inventory|logistic/.test(key)||/บัญชี|การเงิน|จัดซื้อ|คลังสินค้า|ขนส่ง/.test(label))return 'operations';
 if(/service|support|helpdesk|field_engineer|ma_engineer|customer_success|renewal/.test(key)||/บริการ|สนับสนุน|ต่ออายุ/.test(label))return 'service';
 if(/presales|solution|architect|engineer|network|security|cloud|develop|software|frontend|backend|fullstack|qa_|technical|trainer/.test(key)||/โซลูชัน|วิศวกร|ซอฟต์แวร์|ที่ปรึกษา|วิทยากร/.test(label))return 'solutions';
 if(/^executive$|director|manager|pmo|project_coordinator/.test(key)||/ผู้บริหาร|ผู้อำนวยการ|ผู้จัดการ/.test(label))return 'management';
 if(/sales|marketing|account_|product_/.test(key)||/ขาย|การตลาด|ผลิตภัณฑ์/.test(label))return 'sales';
 return 'general';
}
export function groupedRoles(roles,query='',group='all'){
 const q=query.trim().toLocaleLowerCase();return ROLE_GROUPS.map(([id,th,en])=>({id,th,en,roles:roles.filter(r=>roleGroup(r)===id&&(group==='all'||group===id)&&(!q||[r.role_key,r.label_th,r.label_en,r.description,th,en].join(' ').toLocaleLowerCase().includes(q)))})).filter(g=>g.roles.length);
}
export function createRolePicker(React){const h=React.createElement;return function RolePicker({roles=[],value='',onChange,lang='th',disabled=false,required=false,label,cards=false}){
 const [query,Q]=React.useState(''),[group,G]=React.useState('all'),tr=(th,en)=>lang==='th'?th:en,name=r=>r[lang==='th'?'label_th':'label_en']||r.role_key;
 const groups=groupedRoles(roles,query,group),selected=roles.find(r=>r.role_key===value),shown=groups.flatMap(g=>g.roles),hiddenSelected=selected&&!shown.some(r=>r.role_key===value);
 return h('div',{className:'kc-role-browser'},h('div',{className:'kc-role-controls'},h('label',{className:'crm-field'},h('span',null,tr('กลุ่มบทบาท','Role group')),h('select',{'aria-label':tr('กลุ่มบทบาท','Role group'),value:group,disabled,onChange:e=>G(e.target.value)},h('option',{value:'all'},tr('ทุกกลุ่ม','All groups')),ROLE_GROUPS.map(([id,th,en])=>h('option',{key:id,value:id},tr(th,en))))),h('label',{className:'crm-field'},h('span',null,tr('ค้นหาบทบาท','Search roles')),h('input',{type:'search','aria-label':tr('ค้นหาบทบาท','Search roles'),value:query,disabled,placeholder:tr('ชื่อบทบาท หรือรหัส…','Role name or key…'),onKeyDown:e=>{if(e.key==='Enter')e.preventDefault();},onChange:e=>Q(e.target.value)}))),h('label',{className:'crm-field'},h('span',null,label||tr('เลือกบทบาท','Select role')),h('select',{'aria-label':label||tr('เลือกบทบาท','Select role'),value,disabled,required,onChange:e=>onChange(e.target.value)},h('option',{value:''},tr('เลือกบทบาท','Select a role')),hiddenSelected&&h('option',{value},name(selected)+tr(' (บทบาทปัจจุบัน)',' (current role)')),groups.map(g=>h('optgroup',{key:g.id,label:tr(g.th,g.en)},g.roles.map(r=>h('option',{key:r.role_key,value:r.role_key},name(r))))))),h('small',{className:'kc-role-result',role:'status'},shown.length?shown.length+tr(' บทบาทใน ',' roles in ')+groups.length+tr(' กลุ่ม',' groups'):tr('ไม่พบบทบาทที่ตรงกับการค้นหา','No matching roles')),
 cards&&h('div',{className:'kc-role-groups','aria-label':tr('บทบาทที่ใช้งาน','Available roles')},groups.map(g=>h('details',{key:g.id+':'+group+':'+query,open:!!query||group!=='all'||g.roles.some(r=>r.role_key===value)},h('summary',null,tr(g.th,g.en),h('span',null,g.roles.length)),h('div',{className:'crm-role-cards'},g.roles.map(r=>h('button',{type:'button',key:r.role_key,className:'crm-role-card','aria-pressed':value===r.role_key,disabled,onClick:()=>onChange(r.role_key)},h('span',{className:'crm-role-card-top'},h('span',null,name(r)),h('span',{className:'crm-role-badge'},tr(r.is_system?'ระบบ':'กำหนดเอง',r.is_system?'System':'Custom'))),h('small',null,r.description||r.role_key))))))));
};}
