import React from 'react';

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null;
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length;
  const level = score <= 1 ? "weak" : score <= 3 ? "fair" : "strong";
  const label = score <= 1 ? "Weak" : score <= 3 ? "Fair" : "Strong";
  const colors: Record<string, string> = { weak: "var(--red)", fair: "var(--amber)", strong: "var(--green)" };
  return (
    <div>
      <div className="pwd-meter">
        {[0, 1, 2, 3].map(i => <div key={i} className={`pwd-seg ${i < score ? level : ""}`} />)}
      </div>
      <div style={{ fontSize: 'var(--fs-2xs)', color: colors[level], marginTop: 2 }}>{label}</div>
    </div>
  );
}
