-- One address formatter for legacy combined streets and structured addresses.
create or replace function private.crm_address_text(parts text[])
returns text language sql immutable set search_path='' as $$
 select coalesce(string_agg(v, ', ' order by first_seen),'') from (
  select btrim(token) v,min(n) first_seen
  from unnest(string_to_array(array_to_string(parts,','),',')) with ordinality as t(token,n)
  where btrim(token)<>'' group by btrim(token)
 ) x;
$$;
create or replace function private.crm_billing_text(c public.customers)
returns text language sql immutable set search_path='' as $$
 select private.crm_address_text(array[c.address,c.billing_city,c.province,c.billing_postal_code,c.billing_country]);
$$;
create or replace function private.crm_mailing_text(r jsonb)
returns text language sql immutable set search_path='' as $$
 select private.crm_address_text(array[r->>'mailing_street',r->>'mailing_city',r->>'mailing_state',r->>'mailing_postal_code',r->>'mailing_country']);
$$;
create or replace function private.crm_address_empty(address text)
returns boolean language sql immutable set search_path='' as $$
 select lower(btrim(coalesce(address,''))) in ('','thailand','ไทย','ประเทศไทย');
$$;
revoke all on function private.crm_address_text(text[]),private.crm_billing_text(public.customers),private.crm_mailing_text(jsonb),private.crm_address_empty(text) from public,anon;
grant execute on function private.crm_address_text(text[]),private.crm_billing_text(public.customers),private.crm_mailing_text(jsonb),private.crm_address_empty(text) to authenticated;

alter table public.quotations add column address_source text check(address_source in ('customer','custom'));
comment on column public.quotations.address_source is 'customer follows billing address while editable draft; custom and issued snapshots are preserved';

-- Keep snapshots stable once submitted. Old clients that type an address are
-- treated as custom; current clients explicitly select the address source.
create or replace function private.crm_quotation_address()
returns trigger language plpgsql security invoker set search_path='' as $$
declare current_address text;
begin
 if tg_op='UPDATE' and (old.status<>'draft' or coalesce(old.approval_status,'') in ('pending','approved')) then return new; end if;
 select private.crm_billing_text(c) into current_address from public.customers c where c.id=new.customer_id;
 if current_address is null then return new; end if;
 if tg_op='UPDATE' and new.address_source is not distinct from old.address_source
    and new.counterparty_address is distinct from old.counterparty_address
    and new.counterparty_address is distinct from current_address then
  new.address_source:='custom';
 end if;
 if new.address_source is null then
  new.address_source:=case when private.crm_address_empty(new.counterparty_address)
    or private.crm_address_text(array[new.counterparty_address])=current_address then 'customer' else 'custom' end;
 end if;
 if new.address_source='customer' then new.counterparty_address:=current_address; end if;
 return new;
end $$;
revoke all on function private.crm_quotation_address() from public,anon,authenticated;
create trigger crm_address_quotation before insert or update on public.quotations
for each row execute function private.crm_quotation_address();

-- Follow a lead only when the customer is blank or still has that lead's
-- previous address. A separate billing/branch address is never overwritten.
create or replace function private.crm_fill_customer_address_from_lead()
returns trigger language plpgsql security invoker set search_path='' as $$
declare previous_address text; next_address text;
begin
 if new.customer_id is null or new.status<>'converted' then return new; end if;
 next_address:=private.crm_mailing_text(to_jsonb(new));
 if private.crm_address_empty(next_address) then return new; end if;
 if tg_op='UPDATE' and old.customer_id=new.customer_id then previous_address:=private.crm_mailing_text(to_jsonb(old)); end if;
 update public.customers c set address=new.mailing_street,billing_city=new.mailing_city,province=new.mailing_state,
   billing_postal_code=new.mailing_postal_code,billing_country=new.mailing_country,updated_at=clock_timestamp()
 where c.id=new.customer_id
   and (private.crm_address_empty(private.crm_billing_text(c)) or private.crm_billing_text(c)=previous_address)
   and private.crm_billing_text(c) is distinct from next_address;
 update public.contacts c set mailing_street=new.mailing_street,mailing_city=new.mailing_city,mailing_state=new.mailing_state,
   mailing_postal_code=new.mailing_postal_code,mailing_country=new.mailing_country,updated_at=clock_timestamp()
 where c.id=new.converted_contact_id and c.customer_id=new.customer_id
   and (private.crm_address_empty(private.crm_mailing_text(to_jsonb(c))) or private.crm_mailing_text(to_jsonb(c))=previous_address)
   and private.crm_mailing_text(to_jsonb(c)) is distinct from next_address;
 return new;
end $$;

-- Master updates flow only to records already sharing the old master address.
-- All updates run as the caller and retain the existing RLS permission matrix.
create or replace function private.crm_customer_address_changed()
returns trigger language plpgsql security invoker set search_path='' as $$
declare previous_address text:=private.crm_billing_text(old); next_address text:=private.crm_billing_text(new);
begin
 if previous_address=next_address then return new; end if;
 update public.leads l set mailing_street=new.address,mailing_city=new.billing_city,mailing_state=new.province,
   mailing_postal_code=new.billing_postal_code,mailing_country=new.billing_country,updated_at=clock_timestamp()
 where l.customer_id=new.id and l.status='converted'
   and private.crm_mailing_text(to_jsonb(l))=previous_address
   and private.crm_mailing_text(to_jsonb(l)) is distinct from next_address;
 update public.contacts c set mailing_street=new.address,mailing_city=new.billing_city,mailing_state=new.province,
   mailing_postal_code=new.billing_postal_code,mailing_country=new.billing_country,updated_at=clock_timestamp()
 where c.customer_id=new.id and private.crm_mailing_text(to_jsonb(c))=previous_address
   and private.crm_mailing_text(to_jsonb(c)) is distinct from next_address;
 update public.quotations q set counterparty_address=next_address,address_source='customer',updated_at=clock_timestamp()
 where q.customer_id=new.id and q.status='draft' and coalesce(q.approval_status,'') not in ('pending','approved')
   and (q.address_source='customer' or (q.address_source is null and
      (private.crm_address_empty(q.counterparty_address) or private.crm_address_text(array[q.counterparty_address])=previous_address)))
   and q.counterparty_address is distinct from next_address;
 return new;
end $$;
revoke all on function private.crm_customer_address_changed() from public,anon,authenticated;
create trigger crm_customer_address_changed after update of address,billing_city,province,billing_postal_code,billing_country
on public.customers for each row execute function private.crm_customer_address_changed();

-- Repair every unambiguous converted customer, including the older conversion
-- format that stored the entire address in the street field. No name matching.
with candidates as (
 select customer_id,count(distinct private.crm_mailing_text(to_jsonb(l))) addresses
 from public.leads l where status='converted' and customer_id is not null
 and not private.crm_address_empty(private.crm_mailing_text(to_jsonb(l))) group by customer_id
), source as (
 select distinct on(l.customer_id) l.* from public.leads l join candidates k on k.customer_id=l.customer_id and k.addresses=1
 where l.status='converted' and not private.crm_address_empty(private.crm_mailing_text(to_jsonb(l)))
 order by l.customer_id,l.updated_at desc,l.id
)
update public.customers c set address=l.mailing_street,billing_city=l.mailing_city,province=l.mailing_state,
 billing_postal_code=l.mailing_postal_code,billing_country=l.mailing_country,updated_at=clock_timestamp()
from source l where c.id=l.customer_id
 and (private.crm_address_empty(private.crm_billing_text(c)) or private.crm_billing_text(c)=private.crm_mailing_text(to_jsonb(l)))
 and row(c.address,c.billing_city,c.province,c.billing_postal_code,c.billing_country)
 is distinct from row(l.mailing_street,l.mailing_city,l.mailing_state,l.mailing_postal_code,l.mailing_country);

-- Fill converted contacts that still have only the default country.
update public.contacts c set mailing_street=l.mailing_street,mailing_city=l.mailing_city,mailing_state=l.mailing_state,
 mailing_postal_code=l.mailing_postal_code,mailing_country=l.mailing_country,updated_at=clock_timestamp()
from public.leads l where l.status='converted' and c.id=l.converted_contact_id and c.customer_id=l.customer_id
 and private.crm_address_empty(private.crm_mailing_text(to_jsonb(c)))
 and not private.crm_address_empty(private.crm_mailing_text(to_jsonb(l)));

-- Existing custom and issued documents retain their original text.
update public.quotations q set address_source=case when private.crm_address_empty(q.counterparty_address)
 or private.crm_address_text(array[q.counterparty_address])=private.crm_billing_text(c) then 'customer' else 'custom' end,
 updated_at=clock_timestamp()
from public.customers c where c.id=q.customer_id and q.status='draft'
 and coalesce(q.approval_status,'') not in ('pending','approved') and q.address_source is null;
