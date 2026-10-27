// Read the document snapshot; never substitute an internal item code for a part number.
export function itemPartNumber(item={}){
 const direct=String(item.part_number??'').trim();
 if(direct)return direct;
 return String(item.desc||item.description||'').match(/(?:Part\s*(?:Number|No\.?|#)|P\/N)\s*:\s*([^\r\n]+)/i)?.[1]?.trim()||'';
}
