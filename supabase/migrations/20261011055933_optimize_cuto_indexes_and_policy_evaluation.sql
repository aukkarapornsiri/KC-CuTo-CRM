-- CuTo-only performance maintenance. No row changes or permission grants.
-- Small production relations (8–32 kB); fail quickly rather than wait on a busy table.
set local lock_timeout = '2s';
set local statement_timeout = '45s';

-- Equivalent retained index: idx_assets_contract
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_assets_contract'::regclass) <> 'CREATE INDEX idx_assets_contract ON public.assets USING btree (contract_id)'
 OR pg_get_indexdef('public.svc_assets_contract_id'::regclass) <> 'CREATE INDEX svc_assets_contract_id ON public.assets USING btree (contract_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_assets_contract_id'; END IF;
END $$;
DROP INDEX public.svc_assets_contract_id;
-- Equivalent retained index: idx_assets_customer
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_assets_customer'::regclass) <> 'CREATE INDEX idx_assets_customer ON public.assets USING btree (customer_id)'
 OR pg_get_indexdef('public.svc_assets_customer_id'::regclass) <> 'CREATE INDEX svc_assets_customer_id ON public.assets USING btree (customer_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_assets_customer_id'; END IF;
END $$;
DROP INDEX public.svc_assets_customer_id;
-- Equivalent retained index: idx_contracts_customer
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_contracts_customer'::regclass) <> 'CREATE INDEX idx_contracts_customer ON public.contracts USING btree (customer_id)'
 OR pg_get_indexdef('public.svc_contracts_customer_id'::regclass) <> 'CREATE INDEX svc_contracts_customer_id ON public.contracts USING btree (customer_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_contracts_customer_id'; END IF;
END $$;
DROP INDEX public.svc_contracts_customer_id;
-- Equivalent retained index: idx_contracts_opportunity
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_contracts_opportunity'::regclass) <> 'CREATE INDEX idx_contracts_opportunity ON public.contracts USING btree (opportunity_id)'
 OR pg_get_indexdef('public.svc_contracts_opportunity_id'::regclass) <> 'CREATE INDEX svc_contracts_opportunity_id ON public.contracts USING btree (opportunity_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_contracts_opportunity_id'; END IF;
END $$;
DROP INDEX public.svc_contracts_opportunity_id;
-- Equivalent retained index: idx_contracts_quote
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_contracts_quote'::regclass) <> 'CREATE INDEX idx_contracts_quote ON public.contracts USING btree (quotation_id)'
 OR pg_get_indexdef('public.svc_contracts_quotation_id'::regclass) <> 'CREATE INDEX svc_contracts_quotation_id ON public.contracts USING btree (quotation_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_contracts_quotation_id'; END IF;
END $$;
DROP INDEX public.svc_contracts_quotation_id;
-- Equivalent retained index: idx_quotes_contact
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_quotes_contact'::regclass) <> 'CREATE INDEX idx_quotes_contact ON public.quotations USING btree (contact_id)'
 OR pg_get_indexdef('public.svc_quotations_contact_id'::regclass) <> 'CREATE INDEX svc_quotations_contact_id ON public.quotations USING btree (contact_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_quotations_contact_id'; END IF;
END $$;
DROP INDEX public.svc_quotations_contact_id;
-- Equivalent retained index: idx_quotes_customer
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_quotes_customer'::regclass) <> 'CREATE INDEX idx_quotes_customer ON public.quotations USING btree (customer_id)'
 OR pg_get_indexdef('public.svc_quotations_customer_id'::regclass) <> 'CREATE INDEX svc_quotations_customer_id ON public.quotations USING btree (customer_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_quotations_customer_id'; END IF;
END $$;
DROP INDEX public.svc_quotations_customer_id;
-- Equivalent retained index: idx_quotes_opportunity
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_quotes_opportunity'::regclass) <> 'CREATE INDEX idx_quotes_opportunity ON public.quotations USING btree (opportunity_id)'
 OR pg_get_indexdef('public.svc_quotations_opportunity_id'::regclass) <> 'CREATE INDEX svc_quotations_opportunity_id ON public.quotations USING btree (opportunity_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_quotations_opportunity_id'; END IF;
END $$;
DROP INDEX public.svc_quotations_opportunity_id;
-- Equivalent retained index: idx_tickets_asset
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_tickets_asset'::regclass) <> 'CREATE INDEX idx_tickets_asset ON public.tickets USING btree (asset_id)'
 OR pg_get_indexdef('public.svc_tickets_asset_id'::regclass) <> 'CREATE INDEX svc_tickets_asset_id ON public.tickets USING btree (asset_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_tickets_asset_id'; END IF;
END $$;
DROP INDEX public.svc_tickets_asset_id;
-- Equivalent retained index: idx_tickets_contact
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_tickets_contact'::regclass) <> 'CREATE INDEX idx_tickets_contact ON public.tickets USING btree (contact_id)'
 OR pg_get_indexdef('public.svc_tickets_contact_id'::regclass) <> 'CREATE INDEX svc_tickets_contact_id ON public.tickets USING btree (contact_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_tickets_contact_id'; END IF;
END $$;
DROP INDEX public.svc_tickets_contact_id;
-- Equivalent retained index: idx_tickets_contract
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_tickets_contract'::regclass) <> 'CREATE INDEX idx_tickets_contract ON public.tickets USING btree (contract_id)'
 OR pg_get_indexdef('public.svc_tickets_contract_id'::regclass) <> 'CREATE INDEX svc_tickets_contract_id ON public.tickets USING btree (contract_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_tickets_contract_id'; END IF;
END $$;
DROP INDEX public.svc_tickets_contract_id;
-- Equivalent retained index: idx_tickets_customer
DO $$ BEGIN
 IF pg_get_indexdef('public.idx_tickets_customer'::regclass) <> 'CREATE INDEX idx_tickets_customer ON public.tickets USING btree (customer_id)'
 OR pg_get_indexdef('public.svc_tickets_customer_id'::regclass) <> 'CREATE INDEX svc_tickets_customer_id ON public.tickets USING btree (customer_id)' THEN
 RAISE EXCEPTION 'Index definition changed; review svc_tickets_customer_id'; END IF;
END $$;
DROP INDEX public.svc_tickets_customer_id;

-- Cover the nine CuTo foreign keys flagged by the production advisor.
CREATE INDEX crm_perf_access_invitations_invited_by ON public.crm_access_invitations (invited_by);
CREATE INDEX crm_perf_approval_events_actor_id ON public.crm_approval_events (actor_id);
CREATE INDEX crm_perf_approval_requests_submitted_by ON public.crm_approval_requests (submitted_by);
CREATE INDEX crm_perf_record_versions_actor_id ON public.crm_record_versions (actor_id);
CREATE INDEX crm_perf_teams_leader_id ON public.crm_teams (leader_id);
CREATE INDEX crm_perf_user_onboarding_invited_by ON public.crm_user_onboarding (invited_by);
CREATE INDEX crm_perf_opportunities_contact_id ON public.opportunities (contact_id, customer_id);
CREATE INDEX crm_perf_quotations_contact_id ON public.quotations (contact_id, customer_id);
CREATE INDEX crm_perf_quotations_opportunity_id ON public.quotations (opportunity_id, customer_id);

-- Cache only the row-independent auth UID; preserve every authorization predicate.
ALTER POLICY finance_insert ON public.crm_customer_finance_entries
 WITH CHECK ((private.crm_can('customers'::text, 'view'::text) AND private.crm_can('quotations'::text, 'view'::text) AND private.crm_can('quotations'::text, 'approve'::text) AND (created_by = (select auth.uid())) AND (updated_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM customers c
  WHERE (c.id = crm_customer_finance_entries.customer_id)))));
ALTER POLICY finance_update ON public.crm_customer_finance_entries
 USING ((private.crm_can('customers'::text, 'view'::text) AND private.crm_can('quotations'::text, 'view'::text) AND private.crm_can('quotations'::text, 'approve'::text)))
 WITH CHECK ((private.crm_can('customers'::text, 'view'::text) AND private.crm_can('quotations'::text, 'view'::text) AND private.crm_can('quotations'::text, 'approve'::text) AND (updated_by = (select auth.uid()))));
ALTER POLICY readiness_insert ON public.crm_customer_readiness
 WITH CHECK ((private.crm_can('customers'::text, 'view'::text) AND private.crm_can('customers'::text, 'edit'::text) AND (updated_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM customers c
  WHERE (c.id = crm_customer_readiness.customer_id)))));
ALTER POLICY readiness_update ON public.crm_customer_readiness
 USING ((private.crm_can('customers'::text, 'view'::text) AND private.crm_can('customers'::text, 'edit'::text) AND (EXISTS ( SELECT 1
   FROM customers c
  WHERE (c.id = crm_customer_readiness.customer_id)))))
 WITH CHECK ((private.crm_can('customers'::text, 'view'::text) AND private.crm_can('customers'::text, 'edit'::text) AND (updated_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM customers c
  WHERE (c.id = crm_customer_readiness.customer_id)))));
ALTER POLICY crm_onboarding_read ON public.crm_user_onboarding
 USING (((user_id = (select auth.uid())) OR private.crm_is_admin()));
ALTER POLICY crm_profiles_upd ON public.profiles
 USING ((((id = (select auth.uid())) AND private.crm_active_user()) OR private.crm_is_super_admin()))
 WITH CHECK ((((id = (select auth.uid())) AND private.crm_active_user()) OR private.crm_is_super_admin()));

-- PostgreSQL combines permissive policies with OR. Preserve that same expression.
ALTER POLICY crm_settings_sel ON public.custom_roles
 USING ((private.crm_is_super_admin()) OR ((role_key = ( SELECT
        CASE
            WHEN (p.role = 'custom'::text) THEN p.custom_role_key
            ELSE p.role
        END AS role
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_active)))));
DROP POLICY crm_own_role_label_read ON public.custom_roles;
ALTER POLICY crm_settings_sel ON public.role_permissions
 USING ((private.crm_is_super_admin()) OR ((role_key = ( SELECT
        CASE
            WHEN (p.role = 'custom'::text) THEN p.custom_role_key
            ELSE p.role
        END AS role
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_active)))));
DROP POLICY crm_own_role_read ON public.role_permissions;
ALTER POLICY crm_settings_sel ON public.dashboard_type_access
 USING ((private.crm_is_super_admin()) OR ((role_key = ( SELECT
        CASE
            WHEN (p.role = 'custom'::text) THEN p.custom_role_key
            ELSE p.role
        END AS role
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.is_active)))));
DROP POLICY crm_own_dashboard_read ON public.dashboard_type_access;
ALTER POLICY crm_internal_create ON public.crm_knowledge_articles
 WITH CHECK ((private.crm_can('tickets'::text, 'create'::text)) OR (((service_ticket_id IS NOT NULL) AND private.crm_service_access(service_ticket_id, 'edit'::text) AND (EXISTS ( SELECT 1
   FROM tickets
  WHERE ((tickets.id = crm_knowledge_articles.service_ticket_id) AND (tickets.status = 'closed'::text)))))));
DROP POLICY service_engineer_article_create ON public.crm_knowledge_articles;

