import type { StatusTone, VerificationStatus } from "@bevital/shared";

export const VERIFICATION_TONE: Record<VerificationStatus, StatusTone> = {
  verified: "success",
  under_review: "info",
  pending: "warning",
  rejected: "danger",
  suspended: "danger",
};
