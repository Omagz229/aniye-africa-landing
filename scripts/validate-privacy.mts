/**
 * Deterministic validation for PRIV-001 — assessment data never travels in a URL.
 *
 * Run with:  npm run validate:privacy
 *
 * Two kinds of check:
 *   - static: no source under app/ or lib/ builds a URL from assessment data,
 *     base64-encodes or decodes it, or reads the legacy `?d=` parameter;
 *   - behavioural: the local record round-trips, a legacy `?d=` is stripped from
 *     the address bar without its value being decoded, and the privacy headers
 *     are configured.
 *
 * Synthetic data only. This is containment, not intake: nothing here sends,
 * stores or secures a submission anywhere but the visitor's own browser.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMPTY_ASSESSMENT } from '../lib/assessment';
import type { AssessmentData } from '../lib/assessment';
import {
  LAST_SUBMISSION_KEY,
  getLastSubmissionServerSnapshot,
  getLastSubmissionSnapshot,
  parseLastSubmission,
  stripLegacyPayloadFromUrl,
  writeLastSubmission,
} from '../lib/assessment-submission';
import nextConfig, { ASSESSMENT_PRIVACY_HEADERS, ASSESSMENT_PRIVACY_PATHS } from '../next.config';

// ─── Harness ─────────────────────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    failures.push(`${name}\n      ${detail}`);
    console.log(`  ✗ ${name}\n      ${detail}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}\n      expected: ${String(expected)}\n      actual:   ${String(actual)}`);
  }
}

// ─── Source scan ─────────────────────────────────────────────────────────────

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Comments may explain the old `?d=` design; only code is scanned. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const SOURCES = [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'lib'))].map(path => ({
  file: relative(ROOT, path),
  text: stripComments(readFileSync(path, 'utf8')),
}));

function offenders(pattern: RegExp): string[] {
  return SOURCES.filter(s => pattern.test(s.text)).map(s => s.file);
}

function read(file: string): string {
  return stripComments(readFileSync(join(ROOT, file), 'utf8'));
}

console.log('\nPRIV-001 — assessment data in URLs\n');

await check('no source base64-encodes or decodes data (btoa / atob)', () => {
  const found = offenders(/\b(btoa|atob)\s*\(/);
  assert(found.length === 0, `btoa/atob found in: ${found.join(', ')}`);
});

await check('no source builds a ?d= URL', () => {
  const found = offenders(/[?&]d=/);
  assert(found.length === 0, `?d= found in: ${found.join(', ')}`);
});

await check('no source reads the legacy d parameter', () => {
  const found = offenders(/searchParams\??\.d\b|params\??\.d\b|\.get\(\s*['"]d['"]\s*\)/);
  assert(found.length === 0, `d parameter read in: ${found.join(', ')}`);
});

await check('no URL is built from serialized data', () => {
  const found = offenders(/(push|replace|href)\s*[(=]\s*\{?\s*`[^`]*\$\{[^}]*(JSON\.stringify|encode)/);
  assert(found.length === 0, `URL built from serialized data in: ${found.join(', ')}`);
});

await check('/report and /verify pages do not read searchParams', () => {
  for (const file of ['app/report/page.tsx', 'app/verify/page.tsx']) {
    assert(!/searchParams/.test(read(file)), `${file} still reads searchParams.`);
  }
});

await check('the wizard navigates to a bare /report', () => {
  assert(/router\.push\(\s*["']\/report["']\s*\)/.test(read('app/components/assessment/AssessmentWizard.tsx')),
    'AssessmentWizard does not push a bare "/report".');
});

await check('the report links to a bare /verify', () => {
  assert(/href="\/verify"/.test(read('app/components/report/RelationshipSnapshot.tsx')),
    'RelationshipSnapshot does not link to a bare "/verify".');
});

await check('the local record key is defined in one place only', () => {
  const found = SOURCES.filter(s => s.text.includes(`'${LAST_SUBMISSION_KEY}'`) || s.text.includes(`"${LAST_SUBMISSION_KEY}"`))
    .map(s => s.file);
  assertEqual(found.join(','), 'lib/assessment-submission.ts', 'The storage key is duplicated outside its module.');
});

// ─── Customer-facing wording ─────────────────────────────────────────────────
// The screens must describe what actually happens: answers stay on this device,
// nothing reaches Aniyé, no email is sent, and the workspace is not a secure account.

function copyOf(file: string): string {
  return read(file).replace(/&eacute;/g, 'é').replace(/&apos;/g, "'").toLowerCase();
}

await check('no wording implies the assessment was sent or a real account was made', () => {
  const misleading = [
    'after submission',
    'verification link would be sent',
    'assessment answers are kept',
    'assessment data are preserved',
    'a private workspace for your team',
  ];
  const text = SOURCES.map(s => s.text.replace(/&eacute;/g, 'é').toLowerCase()).join('\n');
  const found = misleading.filter(phrase => text.includes(phrase));
  assert(found.length === 0, `Misleading wording found: ${found.join(' | ')}`);
});

await check('review and setup screens say the answers stay on this device', () => {
  const review = copyOf('app/components/assessment/steps/StepReview.tsx');
  assert(review.includes('saved only on this device') && review.includes('not sent to aniyé'),
    'StepReview does not say the answers stay on this device and are not sent to Aniyé.');
  const verify = copyOf('app/components/verify/VerifyGate.tsx');
  for (const phrase of ['nothing has been sent to aniyé', 'no verification email has been sent', 'not yet a secure aniyé account']) {
    assert(verify.includes(phrase), `VerifyGate is missing: "${phrase}".`);
  }
});

// ─── Browser stand-in ────────────────────────────────────────────────────────

interface FakeWindow {
  localStorage: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  location: { href: string };
  history: { state: unknown; replaceState(state: unknown, unused: string, url: string): void };
  addEventListener(): void;
  removeEventListener(): void;
  dispatchEvent(): boolean;
}

function installWindow(href: string) {
  const store = new Map<string, string>();
  const replaced: string[] = [];
  const fake: FakeWindow = {
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k)! : null),
      setItem: (k, v) => { store.set(k, v); },
    },
    location: { href },
    history: { state: { tree: 'kept' }, replaceState: (_s, _u, url) => { replaced.push(url); } },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  (globalThis as unknown as { window: FakeWindow }).window = fake;
  return { store, replaced, fake };
}

// Synthetic only — no real person.
const SYNTHETIC: AssessmentData = {
  ...EMPTY_ASSESSMENT,
  companyName: 'Synthetic Test Co',
  contactName: 'Test Person',
  email: 'test@example.invalid',
  phone: '+000 000 0000',
  whoRecognize: ['Employees'],
  whatMoments: ['Birthdays'],
};

await check('the local record round-trips and drops submittedAt', () => {
  const { store } = installWindow('http://localhost/assessment');
  writeLastSubmission(SYNTHETIC, '2026-10-27T00:00:00.000Z');
  assert(store.has(LAST_SUBMISSION_KEY), 'Nothing was written under the record key.');
  const parsed = parseLastSubmission(getLastSubmissionSnapshot());
  assert(parsed, 'The written record did not parse.');
  assertEqual(JSON.stringify(parsed), JSON.stringify(SYNTHETIC), 'The record did not round-trip.');
  assert(!('submittedAt' in parsed), 'submittedAt leaked into the answers.');
});

await check('a missing, malformed or non-object record parses to null', () => {
  for (const raw of [null, undefined, '', '{not json', '[]', 'null', '42']) {
    assertEqual(parseLastSubmission(raw), null, `Expected null for ${String(raw)}.`);
  }
});

await check('an older record missing fields still renders', () => {
  const parsed = parseLastSubmission(JSON.stringify({ companyName: 'Synthetic Old Co' }));
  assert(parsed, 'The older record did not parse.');
  assertEqual(parsed.companyName, 'Synthetic Old Co', 'A stored field was lost.');
  assert(Array.isArray(parsed.whoRecognize), 'A missing field was not defaulted.');
});

await check('the server snapshot is "not yet known", not "no record"', () => {
  assertEqual(getLastSubmissionServerSnapshot(), undefined, 'The server snapshot must be undefined.');
});

await check('a legacy ?d= is stripped and its value never decoded', () => {
  const { replaced, store } = installWindow('http://localhost/report?d=U1lOVEhFVElD&keep=1#top');
  const realAtob = globalThis.atob;
  const realParse = JSON.parse;
  let decoded = false;
  globalThis.atob = () => { decoded = true; return ''; };
  JSON.parse = ((...args: Parameters<typeof JSON.parse>) => { decoded = true; return realParse(...args); }) as typeof JSON.parse;
  try {
    stripLegacyPayloadFromUrl();
  } finally {
    globalThis.atob = realAtob;
    JSON.parse = realParse;
  }
  assert(!decoded, 'The legacy payload was decoded or parsed.');
  assertEqual(replaced.length, 1, 'replaceState was not called exactly once.');
  assertEqual(replaced[0], '/report?keep=1#top', 'The address was not stripped correctly.');
  assertEqual(store.size, 0, 'Stripping the URL wrote to storage.');
});

await check('a URL without ?d= is left alone', () => {
  const { replaced } = installWindow('http://localhost/report');
  stripLegacyPayloadFromUrl();
  assertEqual(replaced.length, 0, 'replaceState was called with nothing to strip.');
});

// ─── Headers ─────────────────────────────────────────────────────────────────

await check('no-store and no-referrer cover /assessment, /report and /verify', async () => {
  assert(nextConfig.headers, 'next.config has no headers().');
  const rules = await nextConfig.headers();
  for (const path of ['/assessment', '/report', '/verify']) {
    assert((ASSESSMENT_PRIVACY_PATHS as readonly string[]).includes(path), `${path} is not a privacy path.`);
    const rule = rules.find(r => r.source === path);
    assert(rule, `No header rule for ${path}.`);
    const byKey = new Map(rule.headers.map(h => [h.key.toLowerCase(), h.value]));
    assertEqual(byKey.get('referrer-policy'), 'no-referrer', `${path} Referrer-Policy`);
    assertEqual(byKey.get('cache-control'), 'no-store', `${path} Cache-Control`);
  }
  assertEqual(ASSESSMENT_PRIVACY_HEADERS.length, 2, 'Unexpected extra privacy headers.');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log(`\n  ${passed}/${total} checks passed\n`);

if (failures.length > 0) {
  console.error(`Privacy validation FAILED (${failures.length} of ${total}):\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log('Privacy validation passed.\n');
