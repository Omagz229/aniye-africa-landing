export type SetupStage = 'profile' | 'classes' | 'policies' | 'people' | 'programs' | 'active';

export type RelationshipCategory = 'Internal' | 'Client' | 'Governance' | 'Partner' | 'Supplier' | 'Community' | 'Other';
export type RelationshipTier = 'Strategic' | 'Priority' | 'Standard' | 'Custom';

export interface RelationshipClass {
  id: string;
  name: string;
  category: RelationshipCategory;
  description: string;
  tier: RelationshipTier;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  relationshipClasses: RelationshipClass[];
}

const NOW = '2026-06-25T00:00:00.000Z';

export const DEFAULT_RELATIONSHIP_CLASSES: RelationshipClass[] = [
  { id: 'class-executive-leadership', name: 'Executive Leadership', category: 'Internal',    tier: 'Strategic', description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-senior-leadership',    name: 'Senior Leadership',    category: 'Internal',    tier: 'Priority',  description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-managers',             name: 'Managers',             category: 'Internal',    tier: 'Standard',  description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-staff',                name: 'Staff',                category: 'Internal',    tier: 'Standard',  description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-vip-clients',          name: 'VIP Clients',          category: 'Client',      tier: 'Strategic', description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-strategic-clients',    name: 'Strategic Clients',    category: 'Client',      tier: 'Priority',  description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-standard-clients',     name: 'Standard Clients',     category: 'Client',      tier: 'Standard',  description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-board-members',        name: 'Board Members',        category: 'Governance',  tier: 'Strategic', description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-investors',            name: 'Investors',            category: 'Governance',  tier: 'Strategic', description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-partners',             name: 'Partners',             category: 'Partner',     tier: 'Priority',  description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-suppliers',            name: 'Suppliers',            category: 'Supplier',    tier: 'Standard',  description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
];

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
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceState;
    // Migrate: seed relationship classes if missing
    if (!parsed.relationshipClasses || parsed.relationshipClasses.length === 0) {
      parsed.relationshipClasses = DEFAULT_RELATIONSHIP_CLASSES.map(c => ({ ...c }));
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(parsed));
    }
    return parsed;
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
    available: true,
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
