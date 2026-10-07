/** Serializable data the crew canvas renders. Built on the server (load.ts); display strings are final. */
export interface CanvasData {
  isoWeek: string;
  user: { firstName: string; hasReport: boolean; isCrew: boolean };
  credits: { reflection: number; insight: number; consent: number };
  start: {
    routines: Array<{ value: string; label: string }>;
    partners: Array<{ id: string; name: string; hasReport: boolean; routines: Record<string, number> }>;
    last: { routine: string; partnerId: string | null } | null;
  };
  tier: {
    balance: number;
    earned: number;
    current: string;
    next: string | null;
    nextMin: number | null;
    toNext: number;
    percent: number;
    streak: number;
    weekEarned: number;
  };
  recent: {
    total: number;
    sessions: Array<{ id: string; title: string; routine: string; when: string; scenario: string | null; partner: string | null; synergy: boolean }>;
  };
  latest: { id: string; title: string; when: string; cards: Array<{ title: string; lead: string }>; text: string } | null;
  insight: { id: string; week: number; title: string; body: string; confirmed: boolean } | null;
  partners: {
    incoming: Array<{ id: string; name: string; routine: string }>;
    approved: Array<{ id: string; name: string; team: string | null; days: number; routines: string[] }>;
    outgoing: Array<{ id: string; name: string; routine: string; sent: string }>;
  } | null;
  report: { verified: boolean; framework: string | null; linkedHow: string | null; linkedOn: string | null };
  rewards: { org: string; balance: number; items: Array<{ id: string; title: string; description: string | null; cost: number; left: number }> } | null;
}
