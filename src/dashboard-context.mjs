// Share the selected role with dashboard attachments without DOM observers or extra reads.
const contexts=new WeakMap();
export function dashboardRoleContext(React){if(!contexts.has(React))contexts.set(React,React.createContext(()=>{}));return contexts.get(React);}
