// Read the document snapshot; never substitute an internal item code for a part number.
export function itemPartNumber(item={}){
 const direct=String(item.part_number??'').trim();
 if(direct)return direct;
 return String(item.desc||item.description||'').match(/(?:Part\s*(?:Number|No\.?|#)|P\/N)\s*:\s*([^\r\n]+)/i)?.[1]?.trim()||'';
}

// Fill only missing identifiers from an exact linked product; keep saved snapshots.
export function withCatalogPartNumbers(items=[],catalog=[]){
 return items.map(item=>{
  if(itemPartNumber(item))return item;
  const matches=item.price_item_id?catalog.filter(p=>p.id===item.price_item_id):item.code?catalog.filter(p=>p.code===item.code):[];
  if(matches.length!==1)return item;
  const part=String(matches[0].part_number||matches[0].product_details?.part_number||'').trim();
  return part?{...item,part_number:part}:item;
 });
}
