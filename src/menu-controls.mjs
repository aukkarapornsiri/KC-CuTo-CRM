// Shared list-page layout. Reuses the existing controls and their event handlers.
export function createMenuControls(React){
 const h=React.createElement;
 const array=value=>React.Children.toArray(value);
 const classes=node=>typeof node?.props?.className==='string'?node.props.className:'';
 const normalize=(node,index)=>{
  if(!React.isValidElement(node))return node;
  if(node.type===React.Fragment)return array(node.props.children).map(normalize);
  if(node.type==='select'||node.type==='input')return h('label',{className:'crm-menu-field',key:node.key||index},h('span',null,node.props['aria-label']||''),node);
  if(node.type==='label'){
   const children=array(node.props.children);
   return React.cloneElement(node,{key:node.key||index,className:classes(node)+' crm-menu-field'},children.map((child,i)=>typeof child==='string'?h('span',{key:i},child):child));
  }
  return node;
 };
 return function MenuControls({children}){
  const nodes=array(children),filters=nodes.find(n=>/-(filters|fields)\b/.test(classes(n)));
  const toolbar=nodes.find(n=>/-toolbar\b/.test(classes(n)));
  const tools=array(toolbar?.props?.children).find(n=>/-tools\b/.test(classes(n)))||toolbar;
  return h('div',{className:'crm-menu-controls'},filters&&h('div',{className:'crm-menu-filter-fields'},array(filters.props.children).map(normalize)),tools&&h('div',{className:'crm-menu-search-tools'},tools.props.children));
 };
}
