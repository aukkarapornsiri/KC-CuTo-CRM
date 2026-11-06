import {grossProfitSummary} from './sales-financials.mjs';
export const firstItemLine=value=>String(value??'').split(/\r?\n/)[0].trim();
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export function salesOrderSummary(order,financial,canFinancial){
 const sales=numeric(order.subtotal)&&numeric(order.discount??0)?Number(order.subtotal)-Number(order.discount??0):null;
 if(!canFinancial||sales===null)return {sales,cost:null,gp:null,margin:null};
 const lines=financial?.line_financials;
 const cost=Array.isArray(lines)&&lines.length>0&&lines.length===(order.items||[]).length&&lines.every(x=>numeric(x?.cost_total))?lines.reduce((sum,x)=>sum+Number(x.cost_total),0):numeric(financial?.cost_total)?Number(financial.cost_total):null;
 if(cost===null)return {sales,cost:null,gp:null,margin:null};
 const result=grossProfitSummary(sales,cost);return {sales,cost,gp:result.gp_amount,margin:result.has_margin_base?result.gp_margin:null};
}
