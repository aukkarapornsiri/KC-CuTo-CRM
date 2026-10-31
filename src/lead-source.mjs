// Shared source vocabulary. Legacy/imported custom values remain selectable.
export const LEAD_SOURCES=Object.freeze([
 ['Website','เว็บไซต์'],['Facebook','Facebook'],['LINE','LINE'],['Email','อีเมล'],
 ['Phone','โทรศัพท์'],['Referral','การแนะนำ'],['Existing Customer','ลูกค้าเดิม'],
 ['Partner','คู่ค้า / พาร์ทเนอร์'],['Event / Exhibition','งานอีเวนต์ / นิทรรศการ'],['Other','อื่น ๆ']
]);
export function normalizeLeadSource(value){const text=String(value??'').trim();return LEAD_SOURCES.find(pair=>pair.some(v=>v.toLowerCase()===text.toLowerCase()))?.[0]||text;}
export function leadSourceOptions(values=[],lang='th'){
 const options=LEAD_SOURCES.map(([value,th])=>({value,label:lang==='th'?th:value}));
 const known=new Set(options.map(o=>o.value));
 for(const raw of values){const value=normalizeLeadSource(raw);if(value&&!known.has(value)){known.add(value);options.push({value,label:value});}}
 return options;
}
