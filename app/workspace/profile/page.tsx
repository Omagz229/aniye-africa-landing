import type { Metadata } from 'next';
import OrgProfileForm from '@/app/components/workspace/OrgProfileForm';

export const metadata: Metadata = {
  title: 'Organization Profile — Aniyé Africa',
  robots: { index: false },
};

export default function ProfilePage() {
  return <OrgProfileForm />;
}
