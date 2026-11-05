// Presentation defaults only; queries and server permissions still limit access.
const OVERVIEW_ROLES=new Set(['executive','sales_director','sales_manager','admin','super_admin','system_admin','it_admin','administrator']);
export function overviewByDefault(profile){
 if(!profile||profile.is_active===false||profile.access_active===false||profile.deleted_at||profile.deletion_requested_at)return false;
 const role=profile.role==='custom'?profile.custom_role_key:profile.role;
 return profile.is_super_admin===true||OVERVIEW_ROLES.has(String(role||'').trim().toLowerCase());
}
export const defaultDataScope=profile=>overviewByDefault(profile)?'all':'mine';
