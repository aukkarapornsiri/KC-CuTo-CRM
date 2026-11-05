export const PRODUCT_FIELD_ORDER=['name','stock_mode','product_type','product_kind','unit','category','brand','part_number','status','price','cost','vat_mode','barcode','subscription','contract_start','contract_end','track_serial','product_id','income_account','expense_account','inventory_account','asset_account','deferred_account','description'];
export function groupProductFields(fields){
 const order=node=>{const key=String(node.key??node.props?.['data-field']??'');return key==='description'?1000:PRODUCT_FIELD_ORDER.indexOf(key)<0?999:PRODUCT_FIELD_ORDER.indexOf(key);};
 const sorted=[...fields].sort((a,b)=>order(a)-order(b));
 return {required:sorted.filter(n=>n.props?.['data-required']),optional:sorted.filter(n=>!n.props?.['data-required'])};
}
export function createProductFormLayout(React){const h=React.createElement;return function render(fields,t){
 const labels=fields.filter(n=>n?.type==='label'),notes=fields.filter(n=>n?.type==='p'),groups=groupProductFields(labels);
 return h('div',{className:'kc-product-form-sections'},...['required','optional'].filter(key=>groups[key].length).map((key,i)=>h('section',{key,className:'kc-product-form-section','data-group':key},h('header',null,h('span',{className:'kc-product-section-number','aria-hidden':true},String(i+1).padStart(2,'0')),h('div',null,h('h3',null,key==='required'?t('ข้อมูลบังคับกรอก','Required information'):t('ข้อมูลเพิ่มเติม','Additional information')),h('p',null,key==='required'?t('กรอกข้อมูลที่มีเครื่องหมาย * ให้ครบก่อนบันทึก','Complete the fields marked * before saving'):t('ไม่บังคับกรอก · จัดกลุ่มตามการตั้งค่าระบบ','Optional fields · Grouped by system settings')))),h('div',{className:'kc-product-fields-grid'},...groups[key]))),...notes);
 };}
