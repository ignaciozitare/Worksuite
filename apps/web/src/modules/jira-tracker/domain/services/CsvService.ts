import { WorklogService } from './WorklogService';

/** Domain Service — CSV parsing and export */
export const CsvService = {
  parseUsers(raw: string, existingEmails: string[]) {
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return { rows: [] as any[], errorCount: 0 };
    const startIdx = lines[0]!.toLowerCase().includes("name") ? 1 : 0;
    const rows = lines.slice(startIdx).map((line, i) => {
      const [name = "", email = "", role = "user"] = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const errors: string[] = [];
      if (!name) errors.push("Name required");
      if (!email) errors.push("Email required");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email");
      else if (existingEmails.includes(email.toLowerCase())) errors.push("Already exists");
      const normalRole = ["admin", "user"].includes(role.toLowerCase()) ? role.toLowerCase() : "user";
      return { idx: startIdx + i + 1, name, email, role: normalRole, errors, valid: !errors.length };
    });
    return { rows, errorCount: rows.filter(r => !r.valid).length };
  },
  exportWorklogs(worklogs: Record<string, any[]>, from: string, to: string, authorId: string | null, spaceKeys: string[]) {
    const filtered = WorklogService.filterByRange(worklogs, from, to, authorId || null);
    const rows: string[][] = [["Date", "Issue", "Summary", "Epic", "EpicName", "Type", "Project", "Author", "Start", "Time", "Hours", "Description"]];
    for (const [date, wls] of Object.entries(filtered)) {
      for (const w of wls) {
        if (spaceKeys.length && !spaceKeys.includes(w.project)) continue;
        rows.push([date, w.issue, `"${w.summary}"`, w.epic, `"${w.epicName}"`, w.type, w.project, w.author, w.started, w.time, (w.seconds / 3600).toFixed(2), `"${w.description || ""}"` ]);
      }
    }
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `worklogs_${from}_${to}.csv`; a.click(); URL.revokeObjectURL(url);
  },
};
