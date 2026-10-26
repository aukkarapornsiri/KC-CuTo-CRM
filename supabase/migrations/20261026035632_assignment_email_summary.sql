-- Related assignment emails settle for two minutes, then share one delivery.
-- In-app notifications and all business records remain unchanged.
CREATE OR REPLACE FUNCTION private.crm_assignment_email_root(p_module text,p_id uuid,p_created timestamptz)
RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p_module='leads' THEN p_id ELSE (
  SELECT l.id FROM public.leads l
  WHERE l.status='converted' AND l.converted_at BETWEEN p_created-interval '2 minutes' AND p_created+interval '2 minutes'
   AND ((p_module='customers' AND l.customer_id=p_id) OR (p_module='contacts' AND l.converted_contact_id=p_id))
  ORDER BY abs(extract(epoch FROM l.converted_at-p_created)),l.id LIMIT 1
 ) END
$$;
REVOKE ALL ON FUNCTION private.crm_assignment_email_root(text,uuid,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.crm_lead_assigner_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF new.lead_assigner_id IS NULL OR new.status IN ('converted','disqualified')
  OR (new.owner_id IS NOT NULL AND new.status NOT IN ('new','review')) THEN RETURN new; END IF;
 IF TG_OP='UPDATE' AND new.lead_assigner_id IS NOT DISTINCT FROM old.lead_assigner_id THEN RETURN new; END IF;
 INSERT INTO public.notifications(user_id,type,title,body,related_module,related_id)
 VALUES(new.lead_assigner_id,'lead','โปรด Assign Lead: '||coalesce(new.code,''),
 'กรุณาเลือกผู้รับลีด: '||coalesce(nullif(new.company_name,''),new.contact_name,''),'leads',new.id);
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.crm_lead_assigner_notice() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.crm_notification_email_claim()
RETURNS SETOF public.crm_notification_email_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE seed public.crm_notification_email_queue; claimed public.crm_notification_email_queue;
 root_id uuid; members uuid[]; summary text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.crm_email_sender WHERE id AND notifications_enabled AND verified_at IS NOT NULL AND provider='microsoft_graph') THEN RETURN; END IF;
 -- Serialize grouping and claiming, including overlapping cron invocations.
 IF NOT pg_try_advisory_xact_lock(726026,1) THEN RETURN; END IF;
 UPDATE public.crm_notification_email_queue SET status='failed',error='Delivery outcome unknown; check Sent Items before retry'
 WHERE status='sending' AND claimed_at<now()-interval '5 minutes';
 -- A queued request may have become obsolete between enqueue and delivery.
 UPDATE public.crm_notification_email_queue q SET status='skipped',error='Assignment request completed or no longer applicable'
 WHERE q.status='pending' AND q.subject LIKE 'โปรด Assign Lead:%' AND q.related_module='leads'
 AND (NOT EXISTS(SELECT 1 FROM public.leads l WHERE l.id=q.related_id)
  OR EXISTS(SELECT 1 FROM public.notifications n WHERE n.id=q.notification_id AND (n.resolved_at IS NOT NULL OR private.crm_notification_done(n))));
 FOR seed IN SELECT q.* FROM public.crm_notification_email_queue q
 WHERE q.status='pending' AND q.next_attempt_at<=now()
 AND (NOT (q.subject LIKE 'ได้รับมอบหมาย:%' OR q.subject LIKE 'โปรด Assign Lead:%') OR q.created_at<=now()-interval '2 minutes')
 ORDER BY q.created_at,q.id LIMIT 5 FOR UPDATE SKIP LOCKED
 LOOP
  -- Earlier iterations may already have merged this row.
  IF NOT EXISTS(SELECT 1 FROM public.crm_notification_email_queue WHERE id=seed.id AND status='pending') THEN CONTINUE; END IF;
  IF NOT public.crm_notification_email_allowed(seed.id) THEN
   UPDATE public.crm_notification_email_queue SET status='skipped',error='Recipient access removed' WHERE id=seed.id;
   CONTINUE;
  END IF;
  IF seed.subject LIKE 'ได้รับมอบหมาย:%' OR seed.subject LIKE 'โปรด Assign Lead:%' THEN
   root_id:=private.crm_assignment_email_root(seed.related_module,seed.related_id,seed.created_at);
   SELECT array_agg(q.id ORDER BY q.created_at,q.id),string_agg(
    (CASE q.related_module WHEN 'leads' THEN 'ลีด' WHEN 'customers' THEN 'ลูกค้า' WHEN 'contacts' THEN 'ผู้ติดต่อ' ELSE q.related_module END)
    ||' · '||q.subject||E'\n'||q.body||E'\nhttps://kc-cuto.kaicomhub.com/?module='||q.related_module||'&record='||q.related_id::text,
    E'\n\n' ORDER BY q.created_at,q.id)
   INTO members,summary
   FROM public.crm_notification_email_queue q
   WHERE q.status='pending' AND q.next_attempt_at<=now() AND q.user_id=seed.user_id
    AND q.created_at BETWEEN seed.created_at-interval '2 minutes' AND seed.created_at+interval '2 minutes'
    AND (q.subject LIKE 'ได้รับมอบหมาย:%' OR q.subject LIKE 'โปรด Assign Lead:%')
    AND public.crm_notification_email_allowed(q.id)
    AND ((root_id IS NOT NULL AND private.crm_assignment_email_root(q.related_module,q.related_id,q.created_at)=root_id)
      OR (root_id IS NULL AND q.related_module=seed.related_module AND q.related_id=seed.related_id));
   IF cardinality(members)>1 THEN
    UPDATE public.crm_notification_email_queue SET subject='สรุปการมอบหมายงาน ('||cardinality(members)||' รายการ)',body=summary WHERE id=seed.id;
    UPDATE public.crm_notification_email_queue SET status='skipped',error='Included in assignment summary '||seed.id::text
    WHERE id=ANY(members) AND id<>seed.id AND status='pending';
   END IF;
  END IF;
  UPDATE public.crm_notification_email_queue SET status='sending',claimed_at=now(),attempts=attempts+1
  WHERE id=seed.id AND status='pending' RETURNING * INTO claimed;
  IF FOUND THEN RETURN NEXT claimed; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.crm_notification_email_claim() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_notification_email_claim() TO service_role;
