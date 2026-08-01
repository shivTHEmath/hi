-- Read-only export query for the internal human-labeling website.
-- Produces one row per student message for participants with >= 2 submitted assessments.
-- task_type = both means label ICAP and initiation; task_type = icap means label ICAP only.

with cohort as (
  select user_id
  from public.assessments
  where status = 'submitted'
  group by user_id
  having count(*) >= 2
),
first_follow_up as (
  select distinct on (q.attempt_id)
    q.id as first_question_id,
    q.attempt_id
  from public.questions q
  join cohort c on c.user_id = q.user_id
  where q.attempt_id is not null
    and q.phase = 'follow_up'
    and q.student_message is not null
    and btrim(q.student_message) <> ''
  order by q.attempt_id, q.asked_at, q.id
),
labeling_rows as (
  select
    q.id::text as id,
    case when ff.first_question_id = q.id then 'both' else 'icap' end as task_type,
    p.username,
    q.user_id::text as user_id,
    q.id::text as question_id,
    q.attempt_id::text as attempt_id,
    q.phase,
    q.asked_at::text as asked_at,
    coalesce(pa.display_problem, pa.original_problem, '') as problem_context,
    coalesce(q.question, '') as prompt_context,
    coalesce(q.student_message, '') as student_message,
    coalesce(q.response, '') as assistant_response,
    case
      when ff.first_question_id = q.id and length(btrim(q.student_message)) <= 2 then '0'
      when ff.first_question_id = q.id and lower(btrim(q.student_message)) in (
        'hint', 'help', 'idk', 'dont know', 'don''t know', 'tell me', 'answer'
      ) then '0'
      when ff.first_question_id = q.id
        and lower(q.student_message) ~ '(please tell|tell the answer|give me the answer|not possible|i give up|hint)'
      then '0'
      else ''
    end as auto_initiation_score,
    case
      when ff.first_question_id = q.id and length(btrim(q.student_message)) <= 2 then 'minimal message'
      when ff.first_question_id = q.id and lower(btrim(q.student_message)) in (
        'hint', 'help', 'idk', 'dont know', 'don''t know', 'tell me', 'answer'
      ) then 'direct help/passive message'
      when ff.first_question_id = q.id
        and lower(q.student_message) ~ '(please tell|tell the answer|give me the answer|not possible|i give up|hint)'
      then 'direct answer request/help-seeking'
      else ''
    end as auto_reason
  from public.questions q
  join cohort c on c.user_id = q.user_id
  join public.participants p on p.user_id = q.user_id
  left join public.problem_attempts pa on pa.id = q.attempt_id
  left join first_follow_up ff on ff.attempt_id = q.attempt_id
  where q.phase in ('follow_up', 'general_inquiry', 'non_math_decline')
    and q.student_message is not null
    and btrim(q.student_message) <> ''
)
select *
from labeling_rows
order by username, asked_at, id;
