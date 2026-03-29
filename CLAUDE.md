# NxtStepOS — Project Context for Claude Code

## What We're Building
An AI-powered operating system for independent insurance agencies across the US. Not a chatbot — a full AI employee that runs the agency 24/7. The founder's dad runs an independent insurance agency and is the first customer (trial/proof of concept). Long-term goal: sell to every small independent agency in the country at $197-397/month.

## The Founder
- Name: Owen Kreuzberger
- Email: owenkreuzberger@gmail.com
- New to coding, building with Claude as technical partner
- Dad's agency focuses on Commercial and Life insurance

## Live URLs
- Website: https://nxtstepOS.com
- Vercel: https://nxt-step-os.vercel.app
- GitHub repo: nxt-step-os

## Tech Stack
- Frontend: HTML/CSS/JS
- AI Brain: Anthropic Claude API (claude-sonnet-4-20250514)
- Hosting: Vercel (auto-deploys from GitHub)
- Database: Supabase
- Email: Resend (domain: nxtstepos.com verified)
- Automations: Make.com (not set up yet)

## Environment Variables (set in Vercel)
- ANTHROPIC_API_KEY ✅
- RESEND_API_KEY ✅
- SUPABASE_URL: https://vjdjtsfjjibhjufxggid.supabase.co ✅
- SUPABASE_ANON_KEY ✅
- SUPABASE_SERVICE_KEY ✅

## Supabase Database
Project ID: vjdjtsfjjibhjufxggid

Tables:
- leads (id, name, agency, email, phone, insurance_type, status, created_at)
- agencies (id, owner_name, agency_name, email, phone, insurance_type, status, trial_start, plan, created_at)
- clients (id, agency_id, first_name, last_name, email, phone, policy_type, renewal_date, status, notes, created_at)

## File Structure
NxtStepOS/
├── index.html
├── login.html
├── dashboard.html
├── import.html
└── api/
    ├── chat.js
    └── lead.js

## Phases Completed ✅
- Phase 1 — Website live on nxtstepOS.com
- Phase 2 — AI chat working with real Claude AI
- Phase 3 — Anthropic API connected securely via Vercel
- Phase 4 — Lead capture form
- Phase 5 — Real email notifications via Resend
- Phase 6 — Supabase database connected, leads saving
- Phase 7 — Agent login system (Supabase Auth)
- Phase 8 — Agency dashboard (stats, leads, clients, renewals, email tabs)
- Phase 9 — CSV Client Import (import.html) — live at nxtstepOS.com/import.html
  - CSV import with duplicate detection and inline error reporting
  - Export CSV, search/filter, sort columns, delete, edit, add client
  - Renewal dashboard (30/60/90 day bands)
  - Supabase RLS policies added for select, insert, update, delete (anon role)

## Current Phase 🔄
- Phase 10 — Gmail integration

## Phases Remaining ⬜
- Phase 10 — Gmail integration
- Phase 11 — Lead follow-up sequences
- Phase 12 — Renewal automation
- Phase 13 — Proposal generator
- Phase 14 — Coverage Q&A knowledge base
- Phase 15 — SMS follow up
- Phase 16 — Calendar integration
- Phase 17 — Multi agency support
- Phase 18 — Billing (Stripe)
- Phase 19 — Admin dashboard
- Phase 20 — Mobile app
- Phase 21 — Onboarding flow
- Phase 22 — Analytics
- Phase 23 — Integrations (EZLynx, HawkSoft)
- Phase 24 — White labeling
- Phase 25 — API

## Business Model
- 30 day free trial, no credit card
- $197-397/month per agency
- Target: independent agencies 1-5 people, Commercial and Life focus
- Path to $1M: 200 agencies at $397/month = $79,400/month

## Immediate Next Step
Phase 10 — Gmail integration. Also need to review login.html and dashboard.html to understand current auth/dashboard state before building further.
