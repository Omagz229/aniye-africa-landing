import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  RELATIONSHIP_LEVEL_MAX,
  RELATIONSHIP_LEVEL_MIN,
  SCHEMA_V2_RELATIONSHIP_TYPES,
  WORKSPACE_KEY,
  isSchemaV2RelationshipType,
  isValidRelationshipLevel,
  loadAndMigrateWorkspace,
} from './migrations.ts';
import type { SchemaV2RelationshipType } from './migrations.ts';

export {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  RELATIONSHIP_LEVEL_MAX,
  RELATIONSHIP_LEVEL_MIN,
  WORKSPACE_KEY,
  isValidRelationshipLevel,
};

export type SetupStage = 'profile' | 'classes' | 'policies' | 'people' | 'programs' | 'active';

// ─── ADR-002: Relationship Type + Relationship Level ─────────────────────────
// Supersedes RelationshipCategory + RelationshipTier (schema v1).
//
// Type  — the *nature* of the relationship. A closed canonical set.
// Level — relative recognition priority *within* a type. An organization-defined
//         integer where 0 is highest. There is no fixed number of levels, and
//         no job title is baked into the hierarchy: "Executive Leadership" is a
//         display name an organization may rename at will, while the canonical
//         identifier stays numeric.
//
// The canonical values live in ./migrations.ts pinned to schema v2, so that
// historical migrations cannot drift when a future ADR extends this set.

export const RELATIONSHIP_TYPES = SCHEMA_V2_RELATIONSHIP_TYPES;
export type RelationshipType = SchemaV2RelationshipType;
export const isRelationshipType = isSchemaV2RelationshipType;

export const RELATIONSHIP_TYPE_DESCRIPTIONS: Record<RelationshipType, string> = {
  Employee: 'People employed by your organization',
  Client: 'Organizations or individuals who buy from you',
  Partner: 'Collaboration, channel, and referral relationships',
  Supplier: 'Vendors and service providers',
  Board: 'Board of directors and governance seats',
  Investor: 'Shareholders, LPs, and funding partners',
  Government: 'Regulatory contacts and public sector relationships',
  Community: 'NGO, foundation, and civic relationships',
  Other: 'Anything that does not fit the categories above',
};

export interface RelationshipClass {
  id: string;
  name: string;
  type: RelationshipType;
  /** Integer 0–99. 0 is the highest recognition priority within the type. */
  level: number;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Clamp an arbitrary number into the valid Relationship Level range. */
export function clampRelationshipLevel(value: number): number {
  if (!Number.isFinite(value)) return RELATIONSHIP_LEVEL_MIN;
  return Math.min(RELATIONSHIP_LEVEL_MAX, Math.max(RELATIONSHIP_LEVEL_MIN, Math.trunc(value)));
}

const RELATIONSHIP_TYPE_ORDER: Record<RelationshipType, number> = RELATIONSHIP_TYPES.reduce(
  (order, type, index) => {
    order[type] = index;
    return order;
  },
  {} as Record<RelationshipType, number>,
);

/** Canonical display order: by type, then ascending level, then name. */
export function compareRelationshipClasses(a: RelationshipClass, b: RelationshipClass): number {
  const byType = RELATIONSHIP_TYPE_ORDER[a.type] - RELATIONSHIP_TYPE_ORDER[b.type];
  if (byType !== 0) return byType;
  if (a.level !== b.level) return a.level - b.level;
  return a.name.localeCompare(b.name);
}

export function sortRelationshipClasses(classes: RelationshipClass[]): RelationshipClass[] {
  return [...classes].sort(compareRelationshipClasses);
}

/** Lowest unused level within a type — used when adding a class to that type. */
export function nextLevelForType(classes: RelationshipClass[], type: RelationshipType): number {
  const used = new Set(classes.filter(c => c.type === type).map(c => c.level));
  for (let level = RELATIONSHIP_LEVEL_MIN; level <= RELATIONSHIP_LEVEL_MAX; level++) {
    if (!used.has(level)) return level;
  }
  return RELATIONSHIP_LEVEL_MAX;
}

export interface WorkspaceState {
  /** Persisted schema version. See lib/migrations.ts. */
  schemaVersion: number;
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
  recognitionPolicies: RecognitionPolicy[];
}

// ─── Money ───────────────────────────────────────────────────────────────────
// UI simplification: amount stored as face value (e.g. 500000 = NGN 500,000).
// Canonical API will use smallest currency unit (kobo, cents) per Atlas §4.
export interface Money {
  amount: number;
  currency: string;
}

// ─── Recognition Policy types ────────────────────────────────────────────────

export const GIFT_CATEGORIES = [
  'Food & Drink',
  'Wellness & Spa',
  'Luxury Experiences',
  'Home & Living',
  'Technology & Gadgets',
  'Books & Learning',
  'Fashion & Accessories',
  'Art & Culture',
  'Sports & Fitness',
  'Travel & Hospitality',
  'Digital Vouchers',
  'Custom & Personalized',
] as const;
export type GiftCategory = (typeof GIFT_CATEGORIES)[number];

export const RECOGNITION_MOMENT_TYPES = [
  'Birthday',
  'Work Anniversary',
  'Promotion',
  'New Hire Welcome',
  'Holiday Recognition',
  'Client Anniversary',
  'Deal Closure',
  'Achievement Recognition',
  'Farewell',
] as const;
export type RecognitionMomentType = (typeof RECOGNITION_MOMENT_TYPES)[number];

export interface RecognitionRule {
  momentType: string;
  budgetPerPerson: Money;
  isEnabled: boolean;
}

export type ApprovalWorkflow = 'None' | 'Manager' | 'Finance' | 'Executive';
export type DeliveryRequirement = 'Standard' | 'Courier' | 'HandDelivered' | 'Digital';
export type ReportingCadence = 'None' | 'Weekly' | 'Monthly' | 'Quarterly';
export type PolicyStatus = 'Draft' | 'Published' | 'Archived';

export interface RecognitionPolicy {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  recognitionRules: RecognitionRule[];
  approvalWorkflow: ApprovalWorkflow;
  preferredGiftCategories: string[];
  excludedCategories: string[];
  deliveryRequirement: DeliveryRequirement;
  preferredDeliveryWindow: string;
  signatureRequired: boolean;
  proofRequired: boolean;
  reportingCadence: ReportingCadence;
  status: PolicyStatus;
  version: number;
  parentPolicyId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

const NOW = '2026-06-25T00:00:00.000Z';

/**
 * Seed classes for a new workspace, expressed in the ADR-002 model.
 *
 * Ids and names are unchanged from the H2.3 seed set so that a migrated
 * workspace and a freshly created one refer to the same classes.
 *
 * Levels here form a clean per-type ladder starting at 0. A *migrated* legacy
 * workspace will not always match: v1 tier was a single four-value scale shared
 * across every category, so the mapping in lib/migrations.ts can leave gaps
 * (e.g. Partners at level 1 with nothing at level 0). Both states are valid —
 * level is a priority number, not a dense index.
 */
export const DEFAULT_RELATIONSHIP_CLASSES: RelationshipClass[] = [
  { id: 'class-executive-leadership', name: 'Executive Leadership', type: 'Employee', level: 0, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-senior-leadership',    name: 'Senior Leadership',    type: 'Employee', level: 1, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-managers',             name: 'Managers',             type: 'Employee', level: 2, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-staff',                name: 'Staff',                type: 'Employee', level: 3, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-vip-clients',          name: 'VIP Clients',          type: 'Client',   level: 0, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-strategic-clients',    name: 'Strategic Clients',    type: 'Client',   level: 1, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-standard-clients',     name: 'Standard Clients',     type: 'Client',   level: 2, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-partners',             name: 'Partners',             type: 'Partner',  level: 0, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-suppliers',            name: 'Suppliers',            type: 'Supplier', level: 0, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-board-members',        name: 'Board Members',        type: 'Board',    level: 0, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'class-investors',            name: 'Investors',            type: 'Investor', level: 0, description: '', isDefault: true, isActive: true, createdAt: NOW, updatedAt: NOW },
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

// ─── Workspace creation and persistence ──────────────────────────────────────

export interface NewWorkspaceInput {
  companyName: string;
  website: string;
  industry: string;
  employeeCount: string;
  operatingCountries: string[];
  contactName: string;
  contactEmail: string;
  contactRole: string;
  phone: string;
  baseCurrency?: string;
  timezone?: string;
}

/**
 * Build a workspace at the current schema version.
 *
 * Single construction point, so a new workspace can never be written without a
 * `schemaVersion` — which is what created the unversioned v1 payloads this
 * module now has to migrate.
 */
export function createWorkspace(input: NewWorkspaceInput): WorkspaceState {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
    organizationId: crypto.randomUUID(),
    companyName: input.companyName,
    website: input.website,
    industry: input.industry,
    employeeCount: input.employeeCount,
    operatingCountries: input.operatingCountries,
    baseCurrency: input.baseCurrency ?? 'NGN',
    timezone: input.timezone ?? 'Africa/Lagos',
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    contactRole: input.contactRole,
    phone: input.phone,
    setupStage: 'profile',
    createdAt: now,
    relationshipClasses: DEFAULT_RELATIONSHIP_CLASSES.map(c => ({ ...c })),
    recognitionPolicies: [],
  };
}

/**
 * Read the workspace, running any pending schema migrations first.
 *
 * Returns null when there is nothing stored *or* when the stored payload cannot
 * be read. In the latter case the payload is left in place and quarantined by
 * the migration runner rather than discarded.
 */
export function getWorkspace(): WorkspaceState | null {
  if (typeof window === 'undefined') return null;

  let result;
  try {
    result = loadAndMigrateWorkspace<WorkspaceState>(window.localStorage);
  } catch {
    return null;
  }

  if (result.status !== 'ok') return null;

  // Normalization, not migration: a workspace with no classes at all is seeded
  // with the defaults. Kept out of the migration chain because it depends on
  // the *current* default set, which is free to change between releases.
  if (result.workspace.relationshipClasses.length === 0) {
    const seeded: WorkspaceState = {
      ...result.workspace,
      relationshipClasses: DEFAULT_RELATIONSHIP_CLASSES.map(c => ({ ...c })),
    };
    saveWorkspace(seeded);
    return seeded;
  }

  return result.workspace;
}

export function saveWorkspace(state: WorkspaceState): void {
  if (typeof window === 'undefined') return;
  // Stamp the version on every write so no path can persist an unversioned payload.
  const versioned: WorkspaceState = {
    ...state,
    schemaVersion: CURRENT_WORKSPACE_SCHEMA_VERSION,
  };
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(versioned));
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
    label: 'Recognition Policies',
    description: 'Define reusable policies for budgets, approvals, and delivery',
    href: '/workspace/policies',
    available: true,
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
