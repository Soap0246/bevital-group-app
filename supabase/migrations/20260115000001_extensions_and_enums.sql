-- ============================================================================
-- BeVital — migration 1: extensions and enumerations
-- ============================================================================
-- Conventions
--   * All timestamps are timestamptz (stored UTC). Business hours are interpreted
--     in Asia/Kuala_Lumpur (see system_settings.timezone).
--   * Money is numeric(10,2) in MYR.
--   * Every table has RLS enabled in migration 6; nothing is readable by default.
-- ============================================================================

create schema if not exists extensions;
-- btree_gist lets us build exclusion constraints mixing equality (therapist) and
-- range overlap (time slot): the database itself prevents double booking.
create extension if not exists btree_gist with schema extensions;

create type public.user_role as enum ('patient', 'therapist', 'admin');
create type public.appointment_type as enum ('clinic', 'home');

create type public.booking_status as enum (
  'pending',
  'awaiting_confirmation',
  'confirmed',
  'therapist_assigned',
  'on_the_way',
  'arrived',
  'treatment_in_progress',
  'completed',
  'cancelled'
);

create type public.verification_status as enum ('pending', 'under_review', 'verified', 'rejected', 'suspended');
create type public.credential_status as enum ('submitted', 'approved', 'rejected', 'expired');
create type public.credential_type as enum (
  'degree',
  'mahpc_registration',
  'annual_practising_certificate',
  'professional_indemnity',
  'identity',
  'other'
);

create type public.payment_status as enum (
  'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'
);
create type public.payment_method as enum (
  'fpx', 'duitnow_qr', 'credit_card', 'debit_card', 'ewallet', 'package_credit'
);

create type public.record_type as enum (
  'medical_history', 'condition', 'injury', 'allergy', 'surgery', 'medication', 'symptom', 'document'
);
create type public.relationship_type as enum ('child', 'parent', 'spouse', 'sibling', 'grandparent', 'other');
create type public.consent_basis as enum ('guardian_of_minor', 'authorised_representative', 'adult_consented');

create type public.consent_type as enum (
  'terms_of_service',
  'privacy_pdpa',
  'health_data_processing',
  'family_proxy',
  'therapist_record_access',
  'marketing'
);

create type public.notification_type as enum (
  'booking_confirmation',
  'appointment_reminder',
  'payment_confirmation',
  'therapist_assignment',
  'home_visit_update',
  'exercise_reminder',
  'package_expiry',
  'promotion',
  'system'
);

create type public.discount_type as enum ('percent', 'fixed');
create type public.goal_status as enum ('active', 'achieved', 'paused', 'cancelled');
create type public.package_purchase_status as enum ('pending_payment', 'active', 'exhausted', 'expired', 'refunded');
create type public.programme_status as enum ('active', 'completed', 'paused', 'cancelled');
