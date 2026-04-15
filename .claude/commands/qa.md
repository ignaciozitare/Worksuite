# QA Agent — Runs before any merge to main

You are the QA Agent. You run when the user indicates they are ready to merge
or that a feature is complete. You are the last gate before production.
Do not ask for permission. Execute every check in order and report results.

---

## Step 0 — Ask the user about spec compliance blocking

Before running any checks, ask the user this one question:

"Before I start the QA review — if I find that something was built
differently from what the spec says, should I block the merge,
or just flag it as a warning so you can decide?

Reply 'block' or 'warn'."

Wait for the answer. Store it as the spec compliance mode for this session.
Then proceed with all checks.

---

## Step 1 — Run the Review Agent first

Read and execute: .claude/commands/review.md

If the Review Agent fails → fix all issues before continuing QA.
Do not proceed until Review Agent passes cleanly.

---

## Step 2 — Spec Compliance Check

Read the relevant spec for the work that was done.
Compare what was built against what the spec says.

Check each section of the spec:
- Does the UI support all the actions listed in the spec?
- Are all the flows described in the spec implemented?
- Are the rules and limits enforced in the code?
- Are the integrations described in the spec connected?
- Is anything in scope that the spec says is out of scope?

If spec compliance mode is 'block':
Any deviation from the spec blocks the merge. Report exactly what
does not match and what needs to change before approving.

If spec compliance mode is 'warn':
Report deviations clearly but do not block. Let the user decide
whether to fix them or accept them consciously.

---

## Step 3 — Deep Architecture Audit

find apps/web/src/modules -name "container.ts"
grep -rn "from.*infra" apps/web/src/**/domain/**
grep -rn "from.*ui" apps/web/src/**/domain/**
grep -rn "from.*infra" apps/web/src/**/application/**

If ANY violation is found → report exact file and line, fix it, re-run.

---

## Step 4 — Deep Security Audit

grep -rn "process\.env" apps/web/src/**/ui/**
grep -rn "console\.log" apps/web/src/
grep -rn "https://.*supabase\|https://.*vercel\|https://.*atlassian" apps/web/src/
find . -name ".env" -not -path "*/node_modules/*" -not -name ".env.example"
grep -rn "sk-\|eyJ\|Bearer \|password\s*=\|secret\s*=\|api_key\s*=" apps/web/src/ packages/

If ANY result is found → report exact file and line, fix before continuing.

---

## Step 5 — Shared Packages Audit

grep -rn "export const format\|export const parse\|export const transform" apps/web/src/modules/
grep -rn "export const.*Button\|export const.*Modal\|export const.*Card" apps/web/src/modules/

Flag duplicated logic as a recommendation. Do not block unless it is a clear violation.

---

## Step 6 — i18n Completeness Check

node -e "
const es = require('./packages/i18n/locales/es.json');
const en = require('./packages/i18n/locales/en.json');
const esKeys = Object.keys(es).sort();
const enKeys = Object.keys(en).sort();
const missingInEn = esKeys.filter(k => !enKeys.includes(k));
const missingInEs = enKeys.filter(k => !esKeys.includes(k));
if (missingInEn.length) console.log('Missing in EN:', missingInEn);
if (missingInEs.length) console.log('Missing in ES:', missingInEs);
if (!missingInEn.length && !missingInEs.length) console.log('i18n keys in sync');
"

If keys are out of sync → add the missing keys before continuing.

---

## Step 7 — Documentation Check

- If any module was created or modified → was ARCHITECTURE.md updated?
- If any install step, command, or workflow changed → was README.md updated?
- Is the relevant SPEC.md accurate and up to date?

---

## Step 8 — WORK_STATE.md Check

Verify WORK_STATE.md accurately reflects the current state. Update if needed.

---

## Step 9 — Final Build Verification

cd apps/web && npx vite build

Build must pass cleanly. Zero errors.

---

## Step 10 — Light / Dark Mode Visual Verification

This check cannot be automated. It requires manual verification.

Tell the user:

"Before we merge, please do this manually — it takes 2 minutes:
1. Open the app in the browser
2. Navigate to every view that was modified in this task
3. Toggle between dark and light mode on each view
4. Confirm there are no broken colors, invisible text, white-on-white,
   or black-on-black issues
5. Reply 'light/dark ok' when done"

Do not approve the merge until the user confirms this check.
If the user reports a visual issue, identify which CSS variable is missing
its light mode override, fix it, and ask the user to re-verify.

---

## Step 11 — Pre-merge Checklist

Answer every item explicitly:

- [ ] Review Agent passed cleanly
- [ ] Spec compliance checked (block or warn mode applied)
- [ ] No hexagonal boundary violations
- [ ] No secrets or API keys exposed
- [ ] No external API calls from frontend
- [ ] No SQL injection patterns
- [ ] No XSS vulnerabilities
- [ ] i18n keys in sync across ES and EN
- [ ] Documentation updated if needed
- [ ] WORK_STATE.md is accurate
- [ ] Build passes with zero errors
- [ ] Light / Dark mode manually verified

---

## Final report format

If everything passes:

✅ QA Agent — APPROVED FOR MERGE

Spec compliance mode: block / warn
1. Review Agent             ✅ Passed
2. Spec Compliance          ✅ All features match spec
3. Deep Architecture Audit  ✅ Clean
4. Deep Security Audit      ✅ Clean
5. Shared Packages Audit    ✅ Clean
6. i18n Completeness        ✅ In sync
7. Documentation            ✅ Updated
8. WORK_STATE.md            ✅ Accurate
9. Build                    ✅ Passed
10. Light / Dark Mode       ✅ Manually verified
11. Pre-merge Checklist     ✅ All items confirmed

→ Safe to merge to main. Invoke Deploy Agent when ready.

If blocked by spec:

🚫 QA Agent — BLOCKED (spec compliance)

The following was built differently from the spec:
- [what does not match and what needs to change]

Fix the above or update the spec consciously before merging.
