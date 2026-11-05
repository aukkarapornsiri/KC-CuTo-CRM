// Sort copies so dropdown order never changes master records or saved selections.
export function alphabetizeChoices(rows,label,lang='en'){
 const collator=new Intl.Collator(lang==='th'?'th':'en',{numeric:true,sensitivity:'base'});
 return [...rows].sort((a,b)=>collator.compare(String(label(a)??'').trim(),String(label(b)??'').trim()));
}
