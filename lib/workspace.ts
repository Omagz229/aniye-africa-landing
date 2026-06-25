export type SetupStage = 'profile' | 'classes' | 'policies' | 'people' | 'programs' | 'active';

export interface WorkspaceState {
  organizationId: string;
  companyName: string;
  website: string;
  industry: string;
  employeeCount: string;
  operatingCountries: string[];
  baseCurrency: string;
  timezone: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  phone: string;
  setupStage: SetupStage;
  createdAt: string;
}

export const SUPPORTED_CURRENCIES = ['NGN', 'KES', 'GHS', 'ZAR', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  NGN: 'Nigerian Naira (NGN)',
  KES: 'Kenyan Shilling (KES)',
  GHS: 'Ghanaian Cedi (GHS)',
  ZAR: 'South African Rand (ZAR)',
  USD: 'US Dollar (USD)',
};

export const TIMEZONES = [
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Accra',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Africa/Dar_es_Salaam',
  'Africa/Kampala',
  'Africa/Kigali',
  'Africa/Abidjan',
  'Europe/London',
  'America/New_York',
] as const;

export const TIMEZONE_LABELS: Record<string, string> = {
  'Africa/Lagos': 'Lagos (WAT, UTC+1)',
  'Africa/Nairobi': 'Nairobi (EAT, UTC+3)',
  'Africa/Accra': 'Accra (GMT, UTC+0)',
  'Africa/Johannesburg': 'Johannesburg (SAST, UTC+2)',
  'Africa/Cairo': 'Cairo (EET, UTC+2)',
  'Africa/Casablanca': 'Casablanca (WET, UTC+1)',
  'Africa/Dar_es_Salaam': 'Dar es Salaam (EAT, UTC+3)',
  'Africa/Kampala': 'Kampala (EAT, UTC+3)',
  'Africa/Kigali': 'Kigali (CAT, UTC+2)',
  'Africa/Abidjan': 'Abidjan (GMT, UTC+0)',
  'Europe/London': 'London (GMT/BST)',
  'America/New_York': 'New York (EST/EDT)',
};

export const WORKSPACE_KEY = 'aniye_workspace';

export function getWorkspace(): WorkspaceState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceState) : null;
  } catch {
    return null;
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
}

export function updateWorkspace(partial: Partial<WorkspaceState>): WorkspaceState | null {
  const current = getWorkspace();
  if (!current) return null;
  const updated = { ...current, ...partial };
  saveWorkspace(updated);
  return updated;
}

export const SETUP_STAGES: Array<{
  key: SetupStage;
  label: string;
  description: string;
  href: string;
  available: boolean;
}> = [
  {
    key: 'profile',
    label: 'Organization',
    description: 'Company details, location, currency, and contact',
    href: '/workspace/profile',
    available: true,
  },
  {
    key: 'classes',
    label: 'Relationship Classes',
    description: 'Define who matters to your organization',
    href: '/workspace/classes',
    available: false,
  },
  {
    key: 'policies',
    label: 'Relationship Policies',
    description: 'Set budgets, approvals, and preferences per class',
    href: '/workspace/policies',
    available: false,
  },
  {
    key: 'people',
    label: 'People',
    description: 'Import your employees, clients, and partners',
    href: '/workspace/people',
    available: false,
  },
  {
    key: 'programs',
    label: 'Programs',
    description: 'Create your first recognition program',
    href: '/workspace/programs',
    available: false,
  },
];

const STAGE_ORDER: SetupStage[] = ['profile', 'classes', 'policies', 'people', 'programs', 'active'];

export function isStageComplete(stage: SetupStage, currentStage: SetupStage): boolean {
  return STAGE_ORDER.indexOf(currentStage) > STAGE_ORDER.indexOf(stage);
}

export function isStageActive(stage: SetupStage, currentStage: SetupStage): boolean {
  return stage === currentStage;
}
