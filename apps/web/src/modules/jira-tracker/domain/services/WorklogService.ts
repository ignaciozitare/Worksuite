/** Domain Service — worklog aggregation */
export const WorklogService = {
  filterByRange(allWorklogs: Record<string, any[]>, from: string, to: string, authorId: string | null): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    for (const [date, wls] of Object.entries(allWorklogs)) {
      if (date < from || date > to) continue;
      const filtered = authorId ? wls.filter(w => w.authorId === authorId) : wls;
      if (filtered.length) result[date] = filtered;
    }
    return result;
  },
  groupByEpic(worklogs: any[]): Array<{ key: string; name: string; items: any[] }> {
    const map = new Map<string, { key: string; name: string; items: any[] }>();
    for (const wl of worklogs) {
      if (!map.has(wl.epic)) map.set(wl.epic, { key: wl.epic, name: wl.epicName, items: [] });
      map.get(wl.epic)!.items.push(wl);
    }
    return Array.from(map.values());
  },
};
