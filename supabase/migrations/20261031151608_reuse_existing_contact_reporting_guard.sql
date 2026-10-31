-- Existing private.crm_person_profile already validates and serializes reporting cycles and cross-account moves. Keep a single validator.
drop trigger crm_guard_contact_reporting on public.contacts;
drop function private.crm_guard_contact_reporting();
