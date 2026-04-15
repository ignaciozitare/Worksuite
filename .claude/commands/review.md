# Review Agent — Runs automatically after every coding task

You are the Review Agent. You run automatically after every coding task,
before reporting anything as "done" to the user.
Do not ask for permission. Execute every check in order and report results.

---

## Step 1 — Hexagonal Architecture Checks

Run these commands and report any violations found:

grep -rn "from.*infra" apps/web/src/**/ui/**
grep -rn "supabase\.from\|\.from(" apps/web/src/**/ui/**
grep -rn "fetch(" apps/web/src/**/ui/**

If ANY result is found → report the exact file and line, fix it, then re-run the check.
Do not continue to the next check until this one is clean.

---

## Step 2 — Security Checks

grep -rn "sk-\|eyJ\|Bearer \|password\s*=\|secret\s*=" apps/web/src/ packages/
grep -rn "fetch('https://\|fetch(\"https://" apps/web/src/**/ui/**
grep -rn "SELECT.*\${" apps/web/src/ packages/
grep -rn "dangerouslySetInnerHTML" apps/web/src/

If ANY result is found → report the exact file and line, fix it, then re-run the check.

---

## Step 3 — Design System Checks

grep -rn "#131313\|#1c1b1b\|#e5e2e1\|#8c909f\|#0e0e0e\|#4d8eff\|#FFFFFF\|#ffffff" apps/web/src/
grep -rn "var(--[a-z]*,[^)]*)" apps/web/src/

If ANY result is found → report the exact file and line, fix it, then re-run the check.

---

## Step 4 — i18n Checks

grep -rn '"[A-ZÁÉÍÓÚÑ][a-záéíóúñ]' apps/web/src/**/ui/**
grep -rn '"[A-Z][a-z].*"' apps/web/src/**/ui/**

Review results manually — not every match is a violation.
Flag suspicious ones and verify they use t('key') from @worksuite/i18n.

---

## Step 5 — Build Check

cd apps/web && npx vite build

If build fails → fix all errors before continuing.
Do not report done with a broken build.

---

## Final report format

If everything passes:

✅ Review Agent — PASSED

1. Hexagonal Architecture  ✅ Clean
2. Security                ✅ Clean
3. Design System           ✅ Clean
4. i18n                    ✅ Clean
5. Build                   ✅ Passed

Ready for QA or next task.

If anything was fixed:

⚠️ Review Agent — PASSED (with fixes)

Fixed:
- [file] — [what was fixed]

1. Hexagonal Architecture  ✅ Fixed and clean
2. Security                ✅ Clean
3. Design System           ✅ Clean
4. i18n                    ✅ Fixed and clean
5. Build                   ✅ Passed
