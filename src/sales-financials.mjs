// Shared baseline for every CRM sales form. Inputs are net of VAT, after discounts.
export const hasFinancialAmount=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export const roundFinancial=n=>{n=Number(n);const x=Math.sign(n)*Math.round((Math.abs(n)+Number.EPSILON)*100)/100;return Object.is(x,-0)?0:x;};
export function grossProfitSummary(netSales,totalCost){
 if(!hasFinancialAmount(netSales)||!hasFinancialAmount(totalCost))throw Error('Net sales and full cost are required');
 const net_before_tax=roundFinancial(netSales),cost_total=roundFinancial(totalCost),gp_amount=roundFinancial(net_before_tax-cost_total);
 return {net_before_tax,cost_total,gp_amount,gp_margin:net_before_tax===0?0:roundFinancial(gp_amount/net_before_tax*100),has_margin_base:net_before_tax!==0};
}
