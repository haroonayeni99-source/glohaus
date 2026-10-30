CREATE INDEX referral_first_referrer ON beauty.referral_first_attribution(referrer_user_id,attributed_at);
CREATE FUNCTION beauty.owner_referral_foundation() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;month_start timestamptz;BEGIN
 PERFORM beauty.require_owner();month_start:=date_trunc('month',now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London';
 WITH rules AS(SELECT DISTINCT ON(channel) * FROM beauty.referral_rule_versions ORDER BY channel,created_at DESC,id DESC),
 attributed AS(SELECT DISTINCT ON(b.id) b.id,b.customer_id,b.created_at,a.referral_id,a.channel,r.id rule_id
 FROM beauty.bookings b JOIN beauty.professional_profiles p ON p.id=b.professional_id JOIN beauty.referral_first_attribution a ON ((a.channel='professional-to-professional' AND a.referred_user_id=p.user_id) OR (a.channel<>'professional-to-professional' AND a.referred_user_id=b.customer_id)) JOIN rules r ON r.channel=a.channel
 WHERE b.created_at>=a.attributed_at ORDER BY b.id,a.attributed_at,a.referral_id),
 evidence AS(SELECT a.*,beauty.referral_reward_evidence(a.id,a.referral_id,a.rule_id)->>'decision' decision,beauty.referral_retained_net(a.id) net FROM attributed a),
 latest_sim AS(SELECT DISTINCT ON(booking_id) * FROM beauty.referral_reward_simulations ORDER BY booking_id,sequence DESC),
 virtual AS(SELECT DISTINCT ON(referral_id) * FROM latest_sim WHERE decision='QUALIFIED' ORDER BY referral_id,sequence)
 SELECT jsonb_build_object('asOf',now(),'monthStart',month_start,
 'controls',(SELECT to_jsonb(c) FROM beauty.referral_control_versions c ORDER BY id DESC LIMIT 1),'rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY channel) FROM rules r),
 'channels',(SELECT jsonb_agg(jsonb_build_object('channel',r.channel,
 'signups',(SELECT count(*) FROM beauty.referral_first_attribution WHERE channel=r.channel AND attributed_at>=month_start),
 'newActiveProfessionals',(SELECT count(*) FROM beauty.referral_first_attribution a JOIN beauty.professional_profiles p ON p.user_id=a.referred_user_id WHERE a.channel=r.channel AND a.attributed_at>=month_start AND EXISTS(SELECT 1 FROM beauty.bookings b WHERE b.professional_id=p.id AND beauty.referral_booking_is_valid(b.id))),
 'genuineNewCustomers',(SELECT count(DISTINCT customer_id) FROM evidence e WHERE e.channel=r.channel AND e.created_at>=month_start AND decision IN ('QUALIFIED','PENDING_ACTUAL_COSTS','NET_BELOW_MINIMUM','SHARE_LIMIT','AMOUNT_UNSET')),
 'qualifyingBookings',(SELECT count(*) FROM evidence e WHERE e.channel=r.channel AND e.created_at>=month_start AND decision IN ('QUALIFIED','PENDING_ACTUAL_COSTS','NET_BELOW_MINIMUM','SHARE_LIMIT','AMOUNT_UNSET')),
 'repeatBookings',(SELECT count(*) FROM evidence e WHERE e.channel=r.channel AND e.created_at>=month_start AND e.decision='CUSTOMER_NOT_NEW' AND beauty.referral_booking_is_valid(e.id)),
 'retainedNetPence',(SELECT coalesce(sum(net),0) FROM evidence e WHERE e.channel=r.channel AND e.created_at>=month_start AND decision IN ('QUALIFIED','NET_BELOW_MINIMUM','SHARE_LIMIT','AMOUNT_UNSET')),
 'costsPending',(SELECT count(*) FROM evidence e WHERE e.channel=r.channel AND e.created_at>=month_start AND e.decision='PENDING_ACTUAL_COSTS'),
 'wouldEarnPence',(SELECT coalesce(sum(v.would_earn_pence::bigint),0) FROM virtual v JOIN beauty.referral_first_attribution f ON f.referral_id=v.referral_id WHERE f.channel=r.channel AND v.evaluated_at>=month_start),
 'flaggedCases',(SELECT count(*) FROM beauty.referral_risk_cases c JOIN beauty.referral_first_attribution f ON f.referral_id=c.referral_id LEFT JOIN LATERAL(SELECT status FROM beauty.referral_risk_decisions d WHERE d.case_id=c.id ORDER BY sequence DESC LIMIT 1)d ON true WHERE f.channel=r.channel AND coalesce(d.status,'open')<>'approved'),
 'reversedRewards',(SELECT count(*) FROM beauty.referral_rewards w JOIN beauty.referral_reward_events e ON e.reward_id=w.id AND e.status='reversed' WHERE w.channel=r.channel AND e.created_at>=month_start)
 ) ORDER BY r.channel) FROM rules r),
 'partners',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM(SELECT p.id,p.label,p.kind,p.code,u.email recipient,p.created_at FROM beauty.referral_partners p JOIN beauty.users u ON u.id=p.credit_user_id ORDER BY p.created_at DESC LIMIT 100)p),'[]'::jsonb),
 'recipients',coalesce((SELECT jsonb_agg(to_jsonb(u)) FROM(SELECT id,display_name,email FROM beauty.users WHERE status='active' AND deleted_at IS NULL ORDER BY display_name,id LIMIT 500)u),'[]'::jsonb),
 'risks',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM(SELECT c.id,c.reason,c.created_at,u.display_name referred_name,source.display_name referrer_name,coalesce(d.status,'open') status FROM beauty.referral_risk_cases c JOIN beauty.referral_first_attribution f ON f.referral_id=c.referral_id JOIN beauty.users u ON u.id=f.referred_user_id JOIN beauty.users source ON source.id=f.referrer_user_id LEFT JOIN LATERAL(SELECT status FROM beauty.referral_risk_decisions d WHERE d.case_id=c.id ORDER BY sequence DESC LIMIT 1)d ON true ORDER BY c.created_at DESC LIMIT 100)c),'[]'::jsonb),
 'rewards',coalesce((SELECT jsonb_agg(to_jsonb(w)) FROM(SELECT w.id,w.booking_id,w.channel,w.amount_pence,w.retained_net_pence,w.created_at,w.rule_id,u.display_name earner,e.status,
 (SELECT jsonb_agg(jsonb_build_object('status',h.status,'created_at',h.created_at,'reason',h.reason,'actor',actor.display_name) ORDER BY h.sequence) FROM beauty.referral_reward_events h LEFT JOIN beauty.users actor ON actor.id=h.actor_user_id WHERE h.reward_id=w.id) history
 FROM beauty.referral_rewards w JOIN beauty.users u ON u.id=w.earner_user_id JOIN LATERAL(SELECT status FROM beauty.referral_reward_events e WHERE e.reward_id=w.id ORDER BY sequence DESC LIMIT 1)e ON true ORDER BY w.created_at DESC LIMIT 100)w),'[]'::jsonb),
 'settingsHistory',coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM(SELECT 'channel' kind,r.channel,r.created_at,u.display_name actor,r.reason,to_jsonb(r) settings FROM beauty.referral_rule_versions r LEFT JOIN beauty.users u ON u.id=r.actor_user_id UNION ALL SELECT 'master',NULL,c.created_at,u.display_name,c.reason,to_jsonb(c) FROM beauty.referral_control_versions c LEFT JOIN beauty.users u ON u.id=c.actor_user_id ORDER BY created_at DESC LIMIT 50)h),'[]'::jsonb)
 ) INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION beauty.owner_referral_foundation() FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION beauty.owner_referral_foundation() TO beauty_app;
CREATE FUNCTION beauty.owner_refresh_referral_foundation() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN PERFORM beauty.require_owner();RETURN beauty.run_referral_reward_monitor();END $$;
REVOKE ALL ON FUNCTION beauty.owner_refresh_referral_foundation() FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION beauty.owner_refresh_referral_foundation() TO beauty_app;
