const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const cents=value=>{
 if(value===null||value===undefined||value===''||typeof value==='boolean')throw Error('SO line netAmount is required');
 const n=Number(value);if(!Number.isFinite(n)||n<0||n>100000000000)throw Error('Invalid SO line netAmount');
 return Math.round(n*100);
};
export function normalizeProductLines(lines,netAmount){
 if(!Array.isArray(lines)||lines.length>500)throw Error('productLines must be an array of at most 500 items');
 const total=cents(netAmount);let sum=0;
 const normalized=lines.map(line=>{
  if(!line||typeof line!=='object')throw Error('Invalid SO product line');
  const amount=cents(line.netAmount??line.net_amount),product=String(line.product??line.name??'').trim().slice(0,300),code=String(line.productCode??line.code??'').trim().slice(0,120);
  if(!product&&!code)throw Error('SO product line requires a product name or code');
  const stock={};
  if(own(line,'quantity')){
   const quantity=Number(line.quantity);
   if(line.quantity===null||line.quantity===''||typeof line.quantity==='boolean'||!Number.isFinite(quantity)||quantity<=0||quantity>=1e9)throw Error('Invalid SO line quantity');
   stock.quantity=quantity;
  }
  const warehouse=line.warehouseId??line.warehouse_id;
  if(warehouse!==undefined&&warehouse!==null&&warehouse!==''){
   if(typeof warehouse!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(warehouse))throw Error('Invalid SO line warehouseId');
   stock.warehouse_id=warehouse.toLowerCase();
  }
  const serial=line.serialNumber??line.serial_number;
  if(serial!==undefined&&serial!==null&&serial!==''){
   if(typeof serial!=='string'||serial.trim().length>200)throw Error('Invalid SO line serialNumber');
   stock.serial_number=serial.trim();
  }
  sum+=amount;return {product:product||code,code,net_amount:amount/100,...stock};
 });
 if(sum>total)throw Error('Product line net amounts exceed SO netAmount');
 return normalized;
}
export function enrichmentRequest(row,previous={}){
 const currency=String(own(row,'currency')?row.currency:previous.currency||'THB').trim().toUpperCase();
 if(!/^[A-Z]{3}$/.test(currency))throw Error('Invalid SO currency');
 const lines=own(row,'productLines')?row.productLines:previous.product_lines||[];
 const product_lines=normalizeProductLines(lines,row.netAmount);
 const customerChanged=own(row,'customerId')||own(row,'customerCode');
 const customerId=String(row.customerId||'').trim(),customerCode=String(row.customerCode||'').trim();
 if(customerId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId))throw Error('Invalid CRM customerId');
 return {currency,product_lines,customerChanged,customerId,customerCode,customer_id:previous.customer_id||null,customer_name:String(own(row,'customerName')?row.customerName:previous.customer_name||'').trim().slice(0,300),customer_source_id:String(own(row,'customerSourceId')?row.customerSourceId:previous.customer_source_id||'').trim().slice(0,160)};
}
export function staleSO(previous,incoming){return !!previous?.source_updated_at&&!!incoming&&Date.parse(incoming)<Date.parse(previous.source_updated_at);}
