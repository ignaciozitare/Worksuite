/** Domain Service — parse & validate time strings to seconds */
export const TimeParser = {
  parse(raw: string): number {
    const s = (raw || "").trim().toLowerCase();
    const hm = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(?:(\d+)\s*m)?$/);
    if (hm) return Math.round((parseFloat(hm[1]!) + (hm[2] ? parseInt(hm[2]) / 60 : 0)) * 3600);
    const onlyM = s.match(/^(\d+)\s*m$/);
    if (onlyM) return parseInt(onlyM[1]!) * 60;
    const onlyH = s.match(/^(\d+(?:\.\d+)?)$/);
    if (onlyH) return Math.round(parseFloat(onlyH[1]!) * 3600);
    return 0;
  },
  format(secs: number): string {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    if (!h) return `${m}m`;
    if (!m) return `${h}h`;
    return `${h}h ${m}m`;
  },
  toHours(secs: number): number {
    return Math.round((secs / 3600) * 100) / 100;
  },
};
