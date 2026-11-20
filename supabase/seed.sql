-- Reproducible fictional local cases. Contributor: OpenAI Codex (GPT-6), scenarios and dates.
insert into comforce.staff(email) values ('von@comforce.example');

-- Reference numbers follow the fixture order on a fresh database.
insert into comforce.requests(id,submission_key,created_at,neighborhood,description,contact_method,contact,source)
select md5('case ' || seq)::uuid, md5('submission ' || seq)::uuid, received::timestamptz,
       area, note, 'email', 'sample-' || seq || '@example.invalid', source
from (values
  (1,'2026-09-30 16:00-05','Harambee','Groceries and a ride to an appointment.','call'),
  (2,'2026-09-08 09:00-05','Riverwest','A pantry box for this week.','web'),
  (3,'2026-09-21 10:00-05','Bay View','Looking for a place to stay tonight.','text'),
  (4,'2026-10-09 08:30-05','Silver City','Help getting to an after-school program.','call'),
  (5,'2026-10-23 13:30-05','Walker''s Point','Groceries after moving into a new apartment.','web'),
  (6,'2026-11-03 09:20-06','Harambee','A food delivery and a ride to pick up a prescription.','text'),
  (7,'2026-11-06 11:10-06','Bay View','Would like help finding a warm coat.','web'),
  (8,'2026-11-09 12:30-06','Riverwest','Requesting help with food for the weekend.','call'),
  (9,'2026-11-11 14:15-06','Silver City','Looking for an evening youth activity.','web')
) as samples(seq,received,area,note,source) order by seq;

insert into comforce.needs(id,request_id,service,status,owner,follow_up,provider,fulfilled_at,unmet_reason)
select md5('need ' || seq || service)::uuid, md5('case ' || seq)::uuid, service,
       case when delivered is not null then 'fulfilled' when reason is not null then 'unmet' else 'open' end,
       owner_name, due::timestamptz, provider_name, delivered::timestamptz, reason
from (values
  (1,'food','Von',null,'ComForce','2026-10-01 08:10-05',null),
  (1,'transportation','Dee',null,'Sample Ride Circle','2026-10-02 10:20-05',null),
  (2,'food','Von',null,'ComForce','2026-10-01 02:00+00',null),
  (3,'shelter','Dee',null,'Sample Welcome House','2026-09-22 10:10-05',null),
  (4,'youth','Maya',null,'Sample Youth Club','2026-10-12 15:10-05',null),
  (5,'food','Von',null,'ComForce','2026-10-24 14:15-05',null),
  (6,'food','Von',null,'ComForce','2026-11-04 10:40-06',null),
  (6,'transportation','Dee','2026-11-12 09:00-06',null,null,null),
  (7,'other',null,null,null,null,null),
  (8,'food','Maya',null,'ComForce','2026-11-10 16:15-06',null),
  (9,'youth','Maya',null,null,null,'Family declined the available program hours.')
) as items(seq,service,owner_name,due,provider_name,delivered,reason);

insert into comforce.referrals(id,need_id,partner,sent_at,declined_at)
select md5('attempt ' || attempt)::uuid, md5('need ' || seq || service)::uuid,
       partner,sent::timestamptz,declined::timestamptz
from (values
  (1,1,'transportation','Sample Ride Circle','2026-10-01 13:15-05',null),
  (2,3,'shelter','Sample Welcome House','2026-09-21 11:10-05',null),
  (3,4,'youth','Sample Youth Club','2026-10-10 11:10-05',null),
  (4,6,'transportation','Sample Ride Circle','2026-11-05 10:00-06','2026-11-05 12:00-06'),
  (5,6,'transportation','Sample Neighborhood Rides','2026-11-06 10:05-06',null)
) as attempts(attempt,seq,service,partner,sent,declined);

insert into comforce.history(need_id,at,action,detail)
select n.id, r.created_at + interval '10 minutes', 'assign', n.owner
  from comforce.needs n join comforce.requests r on r.id=n.request_id where n.owner is not null
union all select need_id,sent_at,'refer',partner from comforce.referrals
union all select need_id,declined_at,'decline',partner from comforce.referrals where declined_at is not null
union all select id,fulfilled_at,'fulfill',provider from comforce.needs where fulfilled_at is not null
union all select id,'2026-11-06 11:00-06','follow_up','Nov 12, 2026 09:00 Chicago'
  from comforce.needs where follow_up is not null
union all select id,'2026-11-12 15:30-06','unmet',unmet_reason from comforce.needs where status='unmet';
