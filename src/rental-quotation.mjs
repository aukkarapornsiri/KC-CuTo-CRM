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
 if(!['full','partial','advance_months','cycle'].includes(x.payment))throw Error('Invalid rental payment');
 if(items.some(isLumpSum)&&!['full','partial'].includes(x.payment))throw Error('Lump-sum rental requires full or partial upfront payment / เหมาจ่ายเลือกชำระเต็มหรือบางส่วน');
 if(x.payment==='partial'&&amount(x.partial_amount)<=0)throw Error('Enter a positive partial rental payment / ระบุยอดชำระค่าเช่าบางส่วน');
 if(x.deposit_enabled!==undefined&&typeof x.deposit_enabled!=='boolean')throw Error('Invalid deposit switch');
 return {rental:{...(x.deposit_enabled!==undefined?{deposit_enabled:x.deposit_enabled}:{}),...(x.payment==='partial'?{partial_amount:amount(x.partial_amount),balance_terms:String(x.balance_terms||'').slice(0,2000)}:{}),version:1,payment:x.payment,advance_months,deposit:x.deposit_enabled===false?0:amount(x.deposit),deposit_terms:String(x.deposit_terms||'').slice(0,2000),usage_enabled:!!x.usage_enabled,bw_rate:amount(x.bw_rate),color_rate:amount(x.color_rate)}};
}
export function rentalSummary(quote,totals){
 const r=quote.recurring?.rental;if(!r)return null;
 const lines=totals.items||[],round=n=>Math.round(n*100)/100;
 const portion=count=>{const value=lines.reduce((s,i)=>s+Number(i.total)*Math.min(count,Number(i.cycle_count)||1)/(Number(i.cycle_count)||1),0);const base=Number(totals.subtotal)-Number(totals.line_discount||0);return base?round(Number(totals.net_total)*value/base):0;};
 const initial=r.payment==='full'?Number(totals.net_total):r.payment==='partial'?Number(r.partial_amount||0):portion(r.payment==='advance_months'?Number(r.advance_months):1);
 return {...(r.payment==='partial'?{remaining:round(Number(totals.net_total)-initial)}:{}),initial,deposit:Number(r.deposit)||0,due:round(initial+(Number(r.deposit)||0)),regular:['full','partial'].includes(r.payment)?0:portion(1),usage:r.usage_enabled};
}
export const defaultRental=()=>({version:1,payment:'full',advance_months:1,deposit:0,deposit_terms:'',usage_enabled:false,bw_rate:0,color_rate:0});
export function validateRentalPayment(quote,totals){
 const r=quote.recurring?.rental;
 if(r?.payment==='partial'&&(!(Number(r.partial_amount)>0)||Number(r.partial_amount)>Number(totals.net_total)))throw Error('Partial payment must be positive and not exceed net rental / ยอดชำระบางส่วนต้องมากกว่า 0 และไม่เกินค่าเช่าสุทธิ');
}
export function createRentalTerms({React,money}){const h=React.createElement;return function RentalTerms({quote,totals,lang='th',onChange,onQuoteChange,canViewFinancials=false,mode='terms'}){
 const t=(a,b)=>lang==='th'?a:b,r=quote.recurring?.rental;
 if(!r)return onChange?h('button',{type:'button',onClick:()=>onChange({...defaultRental(),payment:quote.items?.some(isLumpSum)?'full':'cycle'})},t('เพิ่มเงื่อนไขเช่า / เงินประกัน / ค่ารายแผ่น','Add rental / deposit / usage terms')):null;
 const patch=(k,v)=>onChange({...r,[k]:v}),summary=rentalSummary(quote,totals);
 const field=(label,k,type='number')=>h('label',{className:'crm-field'},h('span',null,label),h('input',{'aria-label':label,type,min:type==='number'?0:undefined,max:k==='partial_amount'?totals.net_total:undefined,step:k==='advance_months'?1:'0.01',required:k==='partial_amount',value:r[k]??'',onChange:e=>patch(k,type==='number'?Number(e.target.value):e.target.value)}));
 const description=r.payment==='full'?t('ชำระค่าเช่าทั้งสัญญาก่อนส่งสินค้า','Full rental payment before delivery'):r.payment==='partial'?t('ชำระค่าเช่าบางส่วนก่อนส่งสินค้า ส่วนที่เหลือชำระตามเงื่อนไข','Partial rental payment before delivery; balance payable under the terms below'):r.payment==='advance_months'?t(`ชำระล่วงหน้า ${r.advance_months} เดือน จากนั้นชำระรายเดือน`,`Pay ${r.advance_months} months upfront, then monthly`):t('ชำระล่วงหน้าตามรอบของแต่ละรายการ','Pay in advance per item billing cycle');
 const row=(label,value,key)=>h('div',{key},h('dt',null,label),h('dd',null,money(value)));
 if(!onChange&&mode==='amounts')return h('div',{className:'kc-rental-payment-box'},h('strong',null,t('ยอดชำระก่อนส่งสินค้า','Due before delivery')),h('dl',null,row(t('ค่าเช่าชำระครั้งแรก','Initial rental payment'),summary.initial),row(t('เงินประกันคืนได้','Refundable deposit'),summary.deposit),h('div',{className:'net'},h('dt',null,t('รวมชำระครั้งแรก','Initial payment total')),h('dd',null,money(summary.due)+' '+(quote.currency||'THB'))),r.payment==='partial'&&row(t('ค่าเช่าคงเหลือ','Remaining rental balance'),summary.remaining)));
 if(!onChange)return h('section',{className:'kc-recurring-summary'},h('strong',null,t('เงื่อนไขการเช่าและชำระเงิน','Rental and payment terms')),h('p',null,description),r.payment==='partial'&&h('p',null,r.balance_terms||t('ระบุเงื่อนไขชำระส่วนที่เหลือในเอกสาร','See payment instructions for balance terms')),!['full','partial'].includes(r.payment)&&h('p',null,t('ค่าเช่าต่อรอบถัดไป: ','Subsequent rental per cycle: ')+money(summary.regular)),summary.deposit>0&&r.deposit_terms&&h('p',null,r.deposit_terms),r.usage_enabled&&h('p',null,t('ค่ารายแผ่นหลังใช้งานจริง — ขาวดำ ','Actual usage billed in arrears — B&W ')+money(r.bw_rate)+t(' / สี ',' / Color ')+money(r.color_rate)+t(' บาทต่อแผ่น (ก่อนภาษี)',' THB per page (before tax)')),h('small',null,t('เงินประกันแยกจากค่าเช่า ค่ารายแผ่นไม่รวมในยอดสัญญา','Deposit is separate from rental. Usage charges are excluded from the contract total.')));
 const step=(num,title,...children)=>h('section',{className:'kc-rental-step','data-rental-step':num},h('h3',null,h('span',{className:'kc-rental-step-number'},num),title),...children);
 const lineField=(label,index,key,aria)=>h('label',{className:'crm-field'},h('span',null,label),h('input',{type:'number',min:0,step:'0.01','aria-label':aria,value:quote.items[index][key]??0,onChange:e=>onQuoteChange(old=>({...old,items:old.items.map((x,i)=>i===index?{...x,[key]:Number(e.target.value)}:x)}))}));
 return h('div',{className:'kc-rental-settings'},
 step('02',t('ราคาสำหรับการเช่าครั้งนี้','Rental pricing'),h('small',null,t('ต้นทุนและ GP / Margin เป็นข้อมูลภายใน ไม่พิมพ์ให้ลูกค้า','Costs and GP / Margin are internal and excluded from customer documents')),
 ...quote.items.map((item,index)=>isLumpSum(item)&&h('div',{key:index,className:'kc-rental-price-row'},h('strong',null,(index+1)+'. '+(item.name||t('รายการเช่า','Rental item'))),canViewFinancials&&lineField(t('ต้นทุนเหมารวมรายการนี้','Total lump-sum cost'),index,'cost','lump cost '+(index+1)),lineField(t('ราคาขายเหมารวม','Lump selling price'),index,'price','Lump selling price '+(index+1)))),
 !quote.items.some(isLumpSum)&&h('p',null,t('กำหนดราคาและจำนวนรอบของแต่ละรายการในตารางสินค้า','Set each item price and number of cycles in the product table')),
 canViewFinancials&&h('div',{className:'kc-rental-gp'},'GP ',money(totals.gp_amount),' · Margin ',money(totals.gp_margin),'%')),
 step('03',t('เงื่อนไขชำระเงิน','Payment conditions'),...['full','partial'].map(payment=>h('label',{key:payment,className:'kc-rental-radio'},h('input',{type:'radio',name:'rental-payment',value:payment,checked:r.payment===payment,onChange:()=>patch('payment',payment)}),payment==='full'?t('ชำระล่วงหน้าทั้งจำนวนก่อนส่งสินค้า','Full payment before delivery'):t('ชำระบางส่วน (มัดจำค่าเช่า)','Partial rental payment'))),
 r.payment==='partial'&&h('div',{className:'crm-grid'},field(t('ยอดชำระค่าเช่าบางส่วน','Partial rental amount'),'partial_amount'),field(t('เงื่อนไขชำระค่าเช่าคงเหลือ','Rental balance terms'),'balance_terms','text'),h('p',null,t('ค่าเช่าคงเหลือ: ','Remaining rental balance: ')+money(summary.remaining))),
 !quote.items.some(isLumpSum)&&h('label',{className:'crm-field'},t('การชำระตามรอบ','Recurring payment'),h('select',{'aria-label':'Rental payment',value:r.payment,onChange:e=>patch('payment',e.target.value)},h('option',{value:'full'},t('ล่วงหน้าทั้งสัญญา','Full upfront')),h('option',{value:'partial'},t('ชำระบางส่วน','Partial payment')),h('option',{value:'advance_months',disabled:quote.items.some(i=>i.billing_period!=='month')},t('ล่วงหน้า X เดือน แล้วชำระรายเดือน','Advance X months, then monthly')),h('option',{value:'cycle'},t('ล่วงหน้าตามรอบ','Advance per cycle')))),r.payment==='advance_months'&&field(t('เดือนล่วงหน้า','Advance months'),'advance_months')),
 step('04',t('เงินประกัน','Security deposit'),h('label',{className:'kc-rental-radio'},h('input',{type:'checkbox',role:'switch','aria-label':t('ระบุเงินประกัน','Enable security deposit'),checked:r.deposit_enabled??Number(r.deposit)>0,onChange:e=>onChange({...r,deposit_enabled:e.target.checked,deposit:e.target.checked?r.deposit:0})}),t('ระบุเงินประกันคืนได้','Refundable security deposit')),
 (r.deposit_enabled??Number(r.deposit)>0)&&h('div',{className:'crm-grid'},field(t('เงินประกันคืนได้ (บาท)','Refundable deposit'),'deposit'),field(t('เงื่อนไขคืนเงินประกัน','Deposit return terms'),'deposit_terms','text')),
 h('small',null,t('เงินประกันคืนได้แยกจากมัดจำค่าเช่า ไม่หักออกจากค่าเช่าคงเหลือ','Refundable security deposit is separate from rental advance and does not reduce the rental balance'))),
 h('details',null,h('summary',null,t('ค่าบริการตามการใช้งาน','Usage-based charges')),h('label',null,h('input',{type:'checkbox',checked:r.usage_enabled,onChange:e=>patch('usage_enabled',e.target.checked)}),t('คิดค่ารายแผ่นหลังใช้บริการ','Bill per page after usage')),r.usage_enabled&&field(t('ขาวดำ (บาท/แผ่น)','B&W rate per page'),'bw_rate'),r.usage_enabled&&field(t('สี (บาท/แผ่น)','Color rate per page'),'color_rate')),
 h('div',{className:'kc-rental-gp'},t('รวมชำระก่อนส่งสินค้า: ','Total due before delivery: '),money(summary.due)+' '+(quote.currency||'THB')));
};}
