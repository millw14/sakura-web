-- Sakura Careers: job applications (public insert via Supabase anon key + strict RLS).
-- Apply in Dashboard → SQL Editor, or `supabase db push` linked to your project.

create table if not exists public.job_applications (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    role_slug text not null,
    applicant_full_name text not null,
    applicant_email text not null,
    discord_handle text,
    timezone_label text,
    portfolio_url text,
    linkedin_url text,
    cover_letter text not null,
    experience_notes text,
    agrees_privacy boolean not null default false,
    source text not null default 'sakura-web-jobs',
    status text not null default 'new',
    constraint job_applications_role_slug_check check (
        role_slug in (
            'discord_moderator',
            'manga_artist',
            'voice_actor',
            'community_manager',
            'localization_editor',
            'content_qa',
            'marketing_creator',
            'video_motion'
        )
    ),
    constraint job_applications_status_check check (
        status in ('new', 'review', 'shortlisted', 'rejected', 'hired', 'archived')
    ),
    constraint job_applications_name_len check (
        length(trim(applicant_full_name)) between 2 and 200
    ),
    constraint job_applications_email_len check (
        length(trim(applicant_email)) between 5 and 320
    ),
    constraint job_applications_cover_len check (
        length(trim(cover_letter)) between 40 and 12000
    )
);

comment on table public.job_applications is 'Career inquiries submitted from sakura-web /jobs/.';

create index if not exists job_applications_created_at_idx on public.job_applications (created_at desc);
create index if not exists job_applications_role_idx on public.job_applications (role_slug);
create index if not exists job_applications_status_idx on public.job_applications (status);

grant insert on table public.job_applications to anon;

alter table public.job_applications enable row level security;

-- No public SELECT: omit select policy for anon/authenticated clients.

drop policy if exists "job_applications_insert_anon" on public.job_applications;
create policy "job_applications_insert_anon"
    on public.job_applications
    for insert
    to anon
    with check (
        agrees_privacy is true
        and length(trim(applicant_full_name)) >= 2
        and length(trim(applicant_email)) >= 5
        and length(trim(cover_letter)) >= 40
        and source = 'sakura-web-jobs'
    );

-- Optional: authenticated staff read via Dashboard service role bypasses RLS by default.

