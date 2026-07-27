import type { Metadata } from 'next';
import RelationshipClassesPage from '@/app/components/workspace/RelationshipClassesPage';

export const metadata: Metadata = {
  title: 'Relationship groups — Aniyé Africa',
  robots: { index: false },
};

export default function ClassesPage() {
  return <RelationshipClassesPage />;
}
