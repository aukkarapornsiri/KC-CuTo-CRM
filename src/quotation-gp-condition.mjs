export function quotationGPCondition(enabled,threshold,ids,baseIds,people,amount=null){
 if(!enabled)return {low_gp_threshold:null,low_gp_amount:null,low_gp_approver_ids:[]};
 const pct=threshold!==''&&threshold!=null,n=pct?Number(threshold):null;const hasAmount=amount!==''&&amount!=null,m=hasAmount?Number(amount):null;
 if(!pct&&!hasAmount)throw Error('Set a GP percentage or amount threshold');
 if(hasAmount&&(!Number.isFinite(m)||m<0||m>=1e15||Math.abs(Math.round(m*100)-m*100)>1e-6))throw Error('GP amount must be non-negative with at most two decimals');
 if(pct&&(!Number.isFinite(n)||n<0||n>100||Math.abs(Math.round(n*100)-n*100)>1e-8))throw Error('GP threshold must be between 0 and 100, with at most two decimals');
 if(!ids.length||baseIds.length+ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>!id||baseIds.includes(id)||!people.some(p=>p.id===id)))throw Error('Choose distinct eligible GP approvers; combined route cannot exceed 8 steps');
 return {low_gp_threshold:n,low_gp_amount:m,low_gp_approver_ids:[...ids]};
}
export function createQuotationGPFields(React){const h=React.createElement;return function Fields({lang='th',enabled,setEnabled,threshold,setThreshold,amount,setAmount,ids,setIds,baseIds,people,busy}){
 const t=(a,b)=>lang==='th'?a:b;
 return h('section',{className:'kc-flow-existing','aria-label':t("เงื่อนไขอนุมัติ กำไรขั้นต้น ต่ำ",'Low GP approval condition')},
 h('h3',null,t("เงื่อนไข กำไรขั้นต้น / อัตรากำไร ต่ำกว่าเกณฑ์",'Low GP / Margin condition')),
 h('label',{className:'kc-flow-active'},h('input',{type:'checkbox',checked:enabled,disabled:busy,onChange:e=>setEnabled(e.target.checked)}),t("เพิ่มผู้อนุมัติเมื่อ กำไรขั้นต้น ต่ำกว่าเกณฑ์",'Add approvers when GP is below the threshold')),
 enabled&&h(React.Fragment,null,h('label',{className:'kc-flow-field'},t("กำไรขั้นต้น ต่ำกว่า (%)",'GP below (%)'),h('input',{'aria-label':t("กำไรขั้นต้น ต่ำกว่า (%)",'GP below (%)'),type:'number',min:0,max:100,step:'0.01',value:threshold,disabled:busy,onChange:e=>setThreshold(e.target.value)})),
 h('label',{className:'kc-flow-field'},t('กำไรขั้นต้น ต่ำกว่า (จำนวนเงิน)','GP below (amount)'),h('input',{'aria-label':t('กำไรขั้นต้น ต่ำกว่า (จำนวนเงิน)','GP below (amount)'),type:'number',min:0,max:999999999999999,step:'0.01',value:amount??'',disabled:busy,onChange:e=>setAmount(e.target.value)})),
 h('p',null,t('กำหนดเปอร์เซ็นต์หรือจำนวนเงิน หรือทั้งสองค่า เว้นว่างเพื่อไม่ใช้เกณฑ์นั้น เมื่อกำไรต่ำกว่าเกณฑ์ข้อใดข้อหนึ่งจะเพิ่มผู้อนุมัติในคำขอเดิม จำนวนเงินใช้สกุลเงินเดียวกับเอกสาร คำนวณหลังส่วนลด ไม่รวม VAT และรวมต้นทุนสินค้ายอดขายศูนย์ด้วย','Set a percentage, amount, or both; leave unused thresholds blank. Either low threshold adds approvers to the same request. Amounts use the document currency. GP includes discounts and all item costs, excluding VAT. Zero or negative net sales require extra review.')),
 ids.map((id,i)=>h('div',{className:'kc-flow-step',key:i},h('label',{className:'kc-flow-field'},t("ผู้อนุมัติ กำไรขั้นต้น เพิ่มเติม ขั้นที่ ",'Additional GP approver ')+(i+1),h('select',{'aria-label':t("ผู้อนุมัติ กำไรขั้นต้น เพิ่มเติม ขั้นที่ ",'Additional GP approver ')+(i+1),value:id,disabled:busy,onChange:e=>setIds(v=>v.map((x,j)=>i===j?e.target.value:x))},h('option',{value:''},t('เลือกผู้อนุมัติ','Select approver')),people.filter(p=>p.id===id||!baseIds.includes(p.id)&&!ids.includes(p.id)).map(p=>h('option',{key:p.id,value:p.id},p.display_name||p.email)))),
 h('div',{className:'kc-flow-tools'},h('button',{type:'button',disabled:busy||i===0,onClick:()=>setIds(v=>{const a=[...v];[a[i-1],a[i]]=[a[i],a[i-1]];return a;})},'↑'),h('button',{type:'button',disabled:busy||i===ids.length-1,onClick:()=>setIds(v=>{const a=[...v];[a[i+1],a[i]]=[a[i],a[i+1]];return a;})},'↓'),h('button',{type:'button',disabled:busy,onClick:()=>setIds(v=>v.filter((_,j)=>j!==i))},t("ลบขั้น กำไรขั้นต้น",'Remove GP step'))))),
 h('button',{type:'button',disabled:busy||ids.length+baseIds.length>=8,onClick:()=>setIds(v=>[...v,''])},t("+ เพิ่มผู้อนุมัติ กำไรขั้นต้น",'+ Add GP approver'))));
};}
