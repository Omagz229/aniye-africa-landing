import type { AssessmentData } from './assessment';

export interface MaturityLevel {
  level: number;
  label: string;
  description: string;
}

export interface ActionPlan {
  immediatePriorities: string[];
  firstProgram: string;
  priorityCountries: string[];
  operationalImprovements: string[];
  nextStep: string;
}

function parseCountries(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
}

export function computeScore(data: AssessmentData): number {
  let score = 0;

  // Relationship groups (max 24)
  score += Math.min(data.whoRecognize.length * 4, 24);

  // Moment types (max 24)
  score += Math.min(data.whatMoments.length * 4, 24);

  // Geographic complexity (max 20)
  const countries = parseCountries(data.recipientCountries).length ||
    parseCountries(data.operatingCountries).length;
  if (countries === 0) score += 8;
  else if (countries === 1) score += 20;
  else if (countries <= 3) score += 14;
  else score += 8;

  // Process maturity (max 32)
  const processScore: Record<string, number> = {
    'No system': 0,
    'Memory/calendar': 8,
    'Excel/Sheets': 12,
    'WhatsApp': 14,
    'Assistant/EA': 20,
    'HR software': 32,
  };
  score += processScore[data.currentProcess] ?? 0;

  return Math.min(score, 100);
}

export function getMaturityLevel(score: number): MaturityLevel {
  if (score <= 25) return {
    level: 1, label: 'Foundational',
    description: 'Relationships are managed informally. Moments happen when remembered rather than by design.',
  };
  if (score <= 50) return {
    level: 2, label: 'Developing',
    description: 'Some awareness exists. Manual tracking creates gaps, especially across multiple locations.',
  };
  if (score <= 75) return {
    level: 3, label: 'Progressing',
    description: 'A structured approach is forming. The opportunity now is to systematize and scale.',
  };
  return {
    level: 4, label: 'Advanced',
    description: 'A strong relationship foundation is in place. Focus shifts to optimization and intelligence.',
  };
}

export function generateExecutiveInsight(data: AssessmentData): string {
  const rcpCountries = parseCountries(data.recipientCountries);
  const opCountries = parseCountries(data.operatingCountries);
  const countries = rcpCountries.length || opCountries.length;
  const process = data.currentProcess || 'no formal system';
  const topGroup = data.whoRecognize[0] ?? 'key relationships';
  const topChallenge = data.biggestChallenges[0] ?? null;
  const groupCount = data.whoRecognize.length;

  let insight = `${data.companyName || 'Your organization'} manages relationships`;
  if (groupCount > 1) insight += ` across ${groupCount} relationship groups`;
  if (countries > 1) insight += ` in ${countries} countries`;
  const processLabel = process === 'No system' ? 'no formal system'
    : process === 'Memory/calendar' ? 'informal calendar-based tracking'
    : process.toLowerCase();
  insight += `, currently using ${processLabel}.`;

  if (topChallenge) {
    insight += ` The greatest operational risk is ${topChallenge.toLowerCase()}`;
    if (topGroup !== 'key relationships') {
      insight += `, particularly for ${topGroup.toLowerCase()} recognition.`;
    } else {
      insight += '.';
    }
  } else {
    insight += ` Formalizing this approach will protect the most important ${topGroup.toLowerCase()} relationships.`;
  }

  return insight;
}

export function generate90DayPlan(data: AssessmentData): ActionPlan {
  const countries = parseCountries(data.recipientCountries);
  const topGroup = data.whoRecognize[0] ?? 'employees';
  const topMoment = data.whatMoments[0] ?? 'birthdays';
  const challenges = data.biggestChallenges;

  const challengeToAction: Record<string, string> = {
    'Forgetting important moments': `Build a recognition calendar for ${topGroup.toLowerCase()} — start with the next 90 days`,
    'Coordinating across multiple countries': 'Identify one trusted local partner per priority country',
    'Finding reliable vendors': 'Begin with Aniyé-managed fulfillment to remove vendor risk',
    'Tracking deliveries': 'Introduce a simple delivery confirmation workflow per moment',
    'Budget approvals': 'Create a pre-approved recognition budget for the quarter',
    'Manual reminders': 'Replace ad hoc reminders with a structured monthly review',
    'Knowing what to send': 'Define 2–3 standard recognition packages per relationship type',
  };

  const immediatePriorities = challenges
    .filter(c => challengeToAction[c])
    .slice(0, 3)
    .map(c => challengeToAction[c]);

  if (immediatePriorities.length === 0) {
    immediatePriorities.push(`Document all upcoming ${topGroup.toLowerCase()} moments for the next 90 days`);
    immediatePriorities.push(`Establish a recognition budget for the current quarter`);
  }

  return {
    immediatePriorities,
    firstProgram: `Start with ${topGroup.toLowerCase()} ${topMoment.toLowerCase()} recognition — a recurring moment with clear timing and high relationship value.`,
    priorityCountries: countries.length > 0 ? countries.slice(0, 3) : [],
    operationalImprovements: [
      data.currentProcess === 'No system' || data.currentProcess === 'Memory/calendar'
        ? 'Introduce a centralized relationship calendar shared with key stakeholders'
        : `Complement your existing ${data.currentProcess.toLowerCase()} with a dedicated recognition workflow`,
      `Assign a relationship manager or point of contact for ${topGroup.toLowerCase()} moments`,
    ],
    nextStep: `Schedule a consultation with Aniyé to turn this Snapshot into your first active Relationship Program.`,
  };
}
