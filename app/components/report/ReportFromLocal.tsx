"use client";

import { useEffect, useSyncExternalStore } from "react";
import RelationshipSnapshot from "@/app/components/report/RelationshipSnapshot";
import { EMPTY_ASSESSMENT } from "@/lib/assessment";
import {
  getLastSubmissionServerSnapshot,
  getLastSubmissionSnapshot,
  parseLastSubmission,
  stripLegacyPayloadFromUrl,
  subscribeLastSubmission,
} from "@/lib/assessment-submission";

/**
 * PRIV-001: the report reads the assessment saved on this device, never the
 * URL. A legacy `?d=` link is stripped from the address bar and ignored.
 */
export default function ReportFromLocal() {
  const raw = useSyncExternalStore(
    subscribeLastSubmission,
    getLastSubmissionSnapshot,
    getLastSubmissionServerSnapshot,
  );

  useEffect(() => {
    stripLegacyPayloadFromUrl();
  }, []);

  if (raw === undefined) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  const data = parseLastSubmission(raw);
  return <RelationshipSnapshot data={data ?? EMPTY_ASSESSMENT} canVerify={data !== null} />;
}
