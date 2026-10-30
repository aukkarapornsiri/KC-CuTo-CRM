// Optional rental terms: absent on legacy quotations. Never migrate historical documents.
export const isLumpSum=i=>i.billing_period==='once';
export const rentalFactor=i=>isLumpSum(i)?1:Number(i.qty)*(Number(i.cycle_count)||1);
const amount=x=>{const n=Number(x??0);if(!Number.isFinite(n)||n<0||n>=1e12)throw Error('Invalid rental amount / จำนวนเงินการเช่าไม่ถูกต้อง');return Math.round(n*100)/100;};
export function rentalTerms(r,items=[]){
 if(!r.rental)return {};
 const x=r.rental;if(x.version!==1)throw Error('Unsupported rental terms');
 const advance_months=Number(x.advance_months??1);
 if(!Number.isInteger(advance_months)||advance_months<1||advance_months>1200)throw Error('Advance months must be 1–1200 / เดือนล่วงหน้าต้องเป็น 1–1200');
 if(x.payment==='advance_months'&&(items.some(i=>i.billing_period!=='month'||Number(i.cycle_count)<advance_months)))throw Error('Advance months require monthly lines within their contract cycles / เดือนล่วงหน้าต้องไม่เกินจำนวนรอบรายเดือน');
 if(!['full','advance_months','cycle'].includes(x.payment))throw Error('Invalid rental payment');
 if(items.some(isLumpSum)&&x.payment!=='full')throw Error('Lump-sum rental requires full upfront payment / เหมาจ่ายชำระล่วงหน้าทั้งจำนวน');
 return {rental:{version:1,payment:x.payment,advance_months,deposit:amount(x.deposit),deposit_terms:String(x.deposit_terms||'').slice(0,2000),usage_enabled:!!x.usage_enabled,bw_rate:amount(x.bw_rate),color_rate:amount(x.color_rate)}};
}
export function rentalSummary(quote,totals){
 const r=quote.recurring?.rental;if(!r)return null;
 const lines=totals.items||[],round=n=>Math.round(n*100)/100;
 const portion=count=>{const value=lines.reduce((s,i)=>s+Number(i.total)*Math.min(count,Number(i.cycle_count)||1)/(Number(i.cycle_count)||1),0);const base=Number(totals.subtotal)-Number(totals.line_discount||0);return base?round(Number(totals.net_total)*value/base):0;};
 const initial=r.payment==='full'?Number(totals.net_total):portion(r.payment==='advance_months'?Number(r.advance_months):1);
 return {initial,deposit:Number(r.deposit)||0,due:round(initial+(Number(r.deposit)||0)),regular:r.payment==='full'?0:portion(1),usage:r.usage_enabled};
}
export function createRentalTerms({React,money}){const h=React.createElement;return function RentalTerms({quote,totals,lang='th',onChange}){
 const t=(a,b)=>lang==='th'?a:b,r=quote.recurring?.rental;
 if(!r)return onChange?h('button',{type:'button',onClick:()=>onChange({version:1,payment:quote.items?.some(isLumpSum)?'full':'cycle',advance_months:1,deposit:0,deposit_terms:'',usage_enabled:false,bw_rate:0,color_rate:0})},t('เพิ่มเงื่อนไขเช่า / เงินประกัน / ค่ารายแผ่น','Add rental / deposit / usage terms')):null;
 const patch=(k,v)=>onChange({...r,[k]:v}),summary=rentalSummary(quote,totals);
 const field=(label,k,type='number')=>h('label',{className:'crm-field'},h('span',null,label),h('input',{'aria-label':label,type,min:type==='number'?0:undefined,step:k==='advance_months'?1:'0.01',value:r[k]??'',onChange:e=>patch(k,type==='number'?Number(e.target.value):e.target.value)}));
 const description=r.payment==='full'?t('ชำระค่าเช่าทั้งสัญญาก่อนส่งสินค้า','Full rental payment before delivery'):r.payment==='advance_months'?t(`ชำระล่วงหน้า ${r.advance_months} เดือน จากนั้นชำระรายเดือน`,`Pay ${r.advance_months} months upfront, then monthly`):t('ชำระล่วงหน้าตามรอบของแต่ละรายการ','Pay in advance per item billing cycle');
 return h('section',{className:'kc-recurring-summary',style:{marginTop:8}},h('strong',null,t('เงื่อนไขการเช่าและชำระเงิน','Rental and payment terms')),
 onChange?h('div',{className:'crm-grid'},h('label',{className:'crm-field'},h('span',null,t('รูปแบบชำระค่าเช่า','Rental payment')),h('select',{'aria-label':'Rental payment',value:r.payment,onChange:e=>patch('payment',e.target.value)},h('option',{value:'full'},t('ล่วงหน้าทั้งสัญญา','Full upfront')),h('option',{value:'advance_months',disabled:quote.items?.some(i=>i.billing_period!=='month')},t('ล่วงหน้า X เดือน แล้วชำระรายเดือน','Advance X months, then monthly')),h('option',{value:'cycle',disabled:quote.items?.some(isLumpSum)},t('ล่วงหน้าตามรอบ','Advance per cycle')))),r.payment==='advance_months'&&field(t('เดือนล่วงหน้า','Advance months'),'advance_months'),field(t('เงินประกันคืนได้ (บาท)','Refundable deposit'),'deposit'),field(t('เงื่อนไขคืนเงินประกัน','Deposit return terms'),'deposit_terms','text'),h('label',null,h('input',{type:'checkbox',checked:r.usage_enabled,onChange:e=>patch('usage_enabled',e.target.checked)}),t('คิดค่ารายแผ่นหลังใช้บริการ','Bill per page after usage')),r.usage_enabled&&field(t('ขาวดำ (บาท/แผ่น)','B&W rate per page'),'bw_rate'),r.usage_enabled&&field(t('สี (บาท/แผ่น)','Color rate per page'),'color_rate')):null,
 h('p',null,description),h('p',null,t('ค่าเช่าที่ชำระก่อนส่งสินค้า: ','Rental due before delivery: ')+money(summary.initial)+' '+(quote.currency||'THB')),
 h('p',null,t('เงินประกันคืนได้: ','Refundable deposit: ')+money(summary.deposit)),h('strong',null,t('รวมชำระครั้งแรก: ','Initial payment total: ')+money(summary.due)),
 r.payment!=='full'&&h('p',null,t('ค่าเช่าต่อรอบถัดไป: ','Subsequent rental per cycle: ')+money(summary.regular)),
 r.deposit_terms&&h('p',null,r.deposit_terms),r.usage_enabled&&h('p',null,t('ค่ารายแผ่นหลังใช้งานจริง — ขาวดำ ','Actual usage billed in arrears — B&W ')+money(r.bw_rate)+t(' / สี ',' / Color ')+money(r.color_rate)+t(' บาทต่อแผ่น (ก่อนภาษี)',' THB per page (before tax)')),
 h('small',null,t('เงินประกันแยกจากค่าเช่า ค่ารายแผ่นไม่รวมในยอดสัญญา','Deposit is separate from rental. Usage charges are excluded from the contract total.')));
};}
