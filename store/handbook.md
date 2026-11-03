---
title: Team handbook
tags: [onboarding, engineering, docs]
owner: Platform team
updated: 2026-11-03
---

# Team handbook

Everything a new teammate needs in the first week: how we work, how to set up a laptop, and where to find help. Keep this file **short and current** — if something is wrong, fix it in the same pull request.

## Getting started

1. Request access to the repository and the team calendar
2. Install the tools listed below
3. Run the project locally and open your first pull request

```bash
git clone https://github.com/example/handbook.git
cd handbook
npm install
npm run dev
```

## Environment

| Variable      | Default | Purpose                         |
| :------------ | ------: | :------------------------------ |
| `PORT`        |    3000 | Port of the development server  |
| `CACHE_TTL`   |     600 | Cache lifetime, in seconds      |
| `MAX_UPLOADS` |      20 | Files accepted per request      |
| `LOG_LEVEL`   |  `info` | `debug`, `info`, `warn`, `error` |

## How we work

We ship small changes often. Every change goes through a pull request with at least one review, and the main branch is always deployable.

> Prefer a clear question in the team channel over an hour of guessing. Nobody minds.

### Code review

- Review within one working day
- Comment on the code, not the person
- Approve when it is better than before, not when it is perfect

## Example: a feature flag

```ts
export function isEnabled(flag: string, user: User): boolean {
  const rule = flags[flag];
  if (!rule) return false;
  return rule.everyone || rule.users.includes(user.id);
}
```

## First-week checklist

- [x] Laptop set up and repository cloned
- [x] Met the team and your onboarding buddy
- [ ] First pull request merged
- [ ] On-call shadowing booked

## Where to find help

Ask in **#platform-help**, or book a slot with your onboarding buddy. Architecture notes live in `docs/architecture.md`.
