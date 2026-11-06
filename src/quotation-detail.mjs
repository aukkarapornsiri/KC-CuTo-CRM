import {itemPartNumber} from './item-part-number.mjs';
import {quoteTotals} from './internal-model.mjs?v=20261001-service';
const number=x=>Number.isFinite(Number(x))&&x!==null&&x!==undefined;
export function financialSnapshot(row,financial){
 const net=Number(row.subtotal)-Number(row.discount||0);
 if(!financial||!['cost_total','gp_amount','gp_margin'].every(k=>number(financial[k])))return null;
 const gp=Number(financial.gp_amount),margin=net?gp/net*100:0;
 if(Math.abs(net-Number(financial.cost_total)-gp)>.02||Math.abs(margin-Number(financial.gp_margin))>.02)return null;
 const lines=financial.line_financials;
 return {...financial,line_financials:Array.isArray(lines)&&lines.length===row.items.length?lines:null};
}
export function createQuotationDetail({React,client}){
 const h=React.createElement,money=x=>Number(x||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 return function QuotationDetail({row,lang,canViewFinancials,demoMode}){
  const [state,setState]=React.useState({}),t=(th,en)=>lang==='th'?th:en;
  React.useEffect(()=>{let active=true;setState({});if(!canViewFinancials)return;
   if(demoMode){if(row.items.every(x=>number(x.cost))){const totals=quoteTotals(row.items,{taxRate:row.tax_rate??7,withholdingRate:row.wht_rate??0,documentDiscount:row.document_discount??0});setState({id:row.id,data:{cost_total:totals.cost_total,gp_amount:totals.gp_amount,gp_margin:totals.gp_margin,line_financials:totals.items.map(x=>({gp:x.gp,margin:x.margin}))}});}else setState({id:row.id,data:null});return;}
   client.from('crm_quotation_financials').select('cost_total,gp_amount,gp_margin,line_financials').eq('quotation_id',row.id).maybeSingle().then(({data,error})=>{if(active)setState({id:row.id,data,error:!!error});}).catch(()=>{if(active)setState({id:row.id,error:true});});return()=>{active=false;};
  },[row,canViewFinancials,demoMode]);
  const financial=state.id===row.id?financialSnapshot(row,state.data):null;
  return h('div',{id:'crm-quotation-print',className:'kc-quote-compact-items'},
   h('div',{className:'crm-quotation-detail-table'},h('table',{className:'crm-master-table'},
    h('thead',null,h('tr',null,...['#',t('รหัสสินค้า','Part Number'),t('รายละเอียด','Description'),t('จำนวน','Qty'),t('หน่วย','Unit'),t('ราคา / หน่วย','Unit price'),t('มูลค่า','Amount')].map(x=>h('th',{key:x},x)))),
    h('tbody',null,(row.items||[]).map((x,i)=>h('tr',{key:i},h('td',null,i+1),h('td',{'data-field':'part_number'},itemPartNumber(x)||'—'),h('td',{className:'kc-quote-item-first-line',title:String(x.name||x.desc||'').split(/\r?\n/)[0]},String(x.name||x.desc||'').split(/\r?\n/)[0]),h('td',null,x.qty),h('td',null,x.unit||'—'),h('td',null,money(x.price)),h('td',null,money(x.total))))))),
   h('div',{className:'kc-quote-profit-summary'},...[[t('ยอดขายรวม (ก่อน VAT)','Total sales (before VAT)'),money(Number(row.subtotal)-Number(row.discount||0)),'sales'],[t('ต้นทุนรวม (ก่อน VAT)','Total cost (before VAT)'),canViewFinancials&&financial?money(financial.cost_total):'—','cost'],[t('GP รวม','Total GP'),canViewFinancials&&financial?money(financial.gp_amount):'—','gp'],['% Margin',canViewFinancials&&financial?money(financial.gp_margin)+'%':'—','margin']].map(([label,value,tone])=>h('article',{className:'kc-quote-summary-'+tone,key:tone},h('small',null,label),h('strong',null,value)))),
   h('p',{className:'kc-quote-totals-note'},'VAT: '+money(row.vat)+' · '+t('ยอดรวมสุทธิ: ','Net total: ')+money(row.total)+' '+(row.currency||'THB')),
   canViewFinancials&&!financial&&h('p',{className:'crm-financial-note'},state.error?t('โหลดข้อมูลต้นทุนไม่สำเร็จ กรุณาเปิดรายละเอียดอีกครั้ง','Unable to load costs. Please reopen details.'):t('GP และ Margin แสดงเมื่อข้อมูลต้นทุนครบ','GP and margin appear when costs are complete')));
 };
}
