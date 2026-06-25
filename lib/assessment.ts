export interface AssessmentData {
  companyName: string;
  website: string;
  industry: string;
  employeeCount: string;
  operatingCountries: string;
  contactName: string;
  role: string;
  email: string;
  phone: string;
  whoRecognize: string[];
  whatMoments: string[];
  currentProcess: string;
  annualMoments: string;
  recipientCountries: string;
  biggestChallenges: string[];
}

export const INDUSTRIES = [
  'Technology', 'Financial Services', 'Healthcare', 'Retail/FMCG',
  'Professional Services', 'NGO/Development', 'Government', 'Education',
  'Media', 'Other',
];

export const ROLES = [
  'HR Director/Manager', 'People Operations', 'Executive Assistant',
  'Founder/CEO', 'Customer Success', 'Partnerships', 'Marketing', 'Other',
];

export const EMPLOYEE_COUNTS = ['1–50', '51–200', '201–1,000', '1,000+'];

export const WHO_OPTIONS = [
  'Employees', 'Clients', 'Partners', 'Board', 'Investors', 'Suppliers', 'Other',
];

export const MOMENT_OPTIONS = [
  'Birthdays', 'Work anniversaries', 'New hires', 'Promotions',
  'Farewells', 'Holidays/seasonal', 'Client milestones', 'Custom events',
];

export const PROCESS_OPTIONS = [
  'No system', 'Memory/calendar', 'Excel/Sheets',
  'WhatsApp', 'Assistant/EA', 'HR software',
];

export const CHALLENGE_OPTIONS = [
  'Forgetting important moments',
  'Coordinating across multiple countries',
  'Finding reliable vendors',
  'Tracking deliveries',
  'Budget approvals',
  'Manual reminders',
  'Knowing what to send',
  'Other',
];

export const EMPTY_ASSESSMENT: AssessmentData = {
  companyName: '', website: '', industry: '', employeeCount: '', operatingCountries: '',
  contactName: '', role: '', email: '', phone: '',
  whoRecognize: [], whatMoments: [], currentProcess: '',
  annualMoments: '', recipientCountries: '', biggestChallenges: [],
};
