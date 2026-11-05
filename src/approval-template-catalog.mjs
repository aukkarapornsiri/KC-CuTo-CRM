export const EXTENDED_APPROVAL_TEMPLATES=[
 {id:'lead_merge',name:'Approve Lead Merge',th:'อนุมัติรวมลีดต่างผู้รับผิดชอบ',en:'Approve Lead Merge',module:'leads',table:'leads',page:'lead-inbox',flow_th:'เลือกลีดซ้ำต่างผู้รับผิดชอบ → อนุมัติตามลำดับ → รวมโดยเก็บประวัติและผู้รับผิดชอบเดิม',flow_en:'Select duplicate leads with different owners → sequential approval → merge with source history preserved'},
 {id:'lead_reassignment',name:'Approve Lead Reassignment',th:'อนุมัติโอนผู้รับผิดชอบลีด',en:'Approve Lead Reassignment',module:'leads',table:'leads',page:'lead-inbox',flow_th:'เลือกลีดและผู้รับผิดชอบใหม่ → อนุมัติ → โอนงานและแจ้งผู้รับผิดชอบ',flow_en:'Select lead and new owner → approve → assign and notify'},
 {id:'so_cancellation',name:'Approve Sales Order Cancellation',th:'อนุมัติยกเลิกใบสั่งขาย (SO)',en:'Approve Sales Order Cancellation',module:'quotations',table:'crm_sales_orders',page:'quot-list',flow_th:'เลือก SO ที่ยังไม่ส่งมอบ → อนุมัติ → ยกเลิกยอดขายและคืนสต็อกตามระบบเดิม',flow_en:'Select an undelivered SO → approve → cancel sale and reverse stock through existing rules'},
 {id:'credit_terms',name:'Approve Credit Terms',th:'อนุมัติเงื่อนไขเครดิตลูกค้า',en:'Approve Credit Terms',module:'customers',table:'customers',page:'customer-list',flow_th:'ระบุวันเครดิตและวงเงินลูกค้า → อนุมัติ → บันทึกเงื่อนไขในข้อมูลลูกค้า',flow_en:'Request customer credit days and limit → approve → update customer terms'},
 {id:'contract_amendment',name:'Approve Contract Amendment',th:'อนุมัติแก้ไขสัญญา',en:'Approve Contract Amendment',module:'contracts',table:'contracts',page:'con-all',flow_th:'ระบุรายละเอียดสัญญาที่เปลี่ยน → อนุมัติ → บันทึกฉบับแก้ไขพร้อมประวัติ',flow_en:'Propose contract changes → approve → update contract with audit history'},
 {id:'contract_renewal',name:'Approve Contract Renewal',th:'อนุมัติต่ออายุสัญญา',en:'Approve Contract Renewal',module:'contracts',table:'contracts',page:'con-all',flow_th:'ระบุวันสิ้นสุดและมูลค่ารอบใหม่ → อนุมัติ → สร้างสัญญาต่ออายุเชื่อมฉบับเดิม',flow_en:'Set new end date and value → approve → create a linked renewal contract'},
 {id:'inventory_adjustment',name:'Approve Inventory Adjustment',th:'อนุมัติปรับสต็อก',en:'Approve Inventory Adjustment',module:'inventory',table:'crm_price_items',page:'inventory',flow_th:'เลือกสินค้า คลัง และจำนวนเพิ่ม/ลด → อนุมัติ → ลงรายการปรับสต็อก',flow_en:'Select item, warehouse and quantity delta → approve → post stock adjustment'},
 {id:'special_purchase',name:'Approve Special Purchase',th:'อนุมัติจัดซื้อพิเศษตาม SO',en:'Approve Special Purchase',module:'quotations',table:'crm_sales_orders',page:'quot-list',flow_th:'เลือก SO ผู้ขาย และรายการจัดซื้อ → อนุมัติ → ออกรายการอนุมัติวงเงินสำหรับดำเนินการจัดซื้อ',flow_en:'Select SO, supplier and purchase lines → approve → record purchase authorization; no automatic receipt or payment'}
];
export function templatePayload(type,draft){
 const number=k=>{const v=Number(draft[k]);if(draft[k]===''||draft[k]==null||!Number.isFinite(v))throw Error('Invalid number: '+k);return v;};
 switch(type){
 case 'lead_merge':return {source_id:draft.source_id};
 case 'lead_reassignment':return {owner_id:draft.owner_id};
 case 'so_cancellation':return {};
 case 'credit_terms':return {credit_days:number('credit_days'),credit_limit:number('credit_limit')};
 case 'contract_amendment':return {name:draft.name,product:draft.product,value:number('value'),start_date:draft.start_date,end_date:draft.end_date,sla_level:draft.sla_level};
 case 'contract_renewal':return {end_date:draft.end_date,value:number('value')};
 case 'inventory_adjustment':return {warehouse_id:draft.warehouse_id,serial_number:(draft.serial_number||'').trim(),quantity:number('quantity')};
 case 'special_purchase':return {supplier:draft.supplier,items:(draft.items||[]).map(i=>{const qty=Number(i.qty),unit_cost=Number(i.unit_cost);if(!i.name?.trim()||i.qty===''||i.unit_cost===''||!Number.isFinite(qty)||qty<=0||!Number.isFinite(unit_cost)||unit_cost<0)throw Error('Invalid purchase line');return {name:i.name.trim(),qty,unit_cost};})};
 default:throw Error('Unknown approval template');
 }
}
export function templateCanReview(request,userId){return request?.status==='pending'&&request.requested_by!==userId&&request.approver_ids?.[request.current_step-1]===userId;}

export function templatePermitted(type,can,review=false){
 const t=EXTENDED_APPROVAL_TEMPLATES.find(t=>t.id===type);if(!t)return false;
 return can(t.module,'view')&&can(t.module,type==='inventory_adjustment'?'create':'edit')&&(type!=='lead_reassignment'||can('leads','assign'))&&(type!=='contract_renewal'||can('contracts','create'))&&(!review||can(t.module,['lead_merge','lead_reassignment'].includes(type)?'assign':'approve'));
}
