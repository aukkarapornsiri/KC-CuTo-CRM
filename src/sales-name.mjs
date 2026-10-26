// Presentation only: never write an abbreviated name back to a profile or record.
export function shortSalesName(value){
 const name=String(value??'').trim().replace(/\s+/gu,' ');
 if(!name||name.includes('@'))return name;
 const parts=name.split(' ');
 if(parts.length<2)return name;
 const initial=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(parts[1])][0]?.segment:Array.from(parts[1])[0];
 return parts[0]+' '+initial+'.';
}
