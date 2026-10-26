// Creation order is independent of edits and input/database retrieval order.
const createdTime=row=>{const value=Date.parse(row.created_at||row.converted_at||'');return Number.isFinite(value)?value:0;};
export function compareRecordsNewest(a,b){return createdTime(b)-createdTime(a)||String(b.code||b.so_number||'').localeCompare(String(a.code||a.so_number||''),'en',{numeric:true})||String(b.id||'').localeCompare(String(a.id||''),'en');}
export const sortRecordsNewest=rows=>[...(rows||[])].sort(compareRecordsNewest);
