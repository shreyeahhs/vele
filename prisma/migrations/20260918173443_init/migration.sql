-- Extensions: trigram search and GiST support for the booking exclusion constraint.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "CalendarProviderId" AS ENUM ('VELE', 'MICROSOFT', 'GOOGLE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('CONFIRMED', 'TENTATIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventShowAs" AS ENUM ('BUSY', 'TENTATIVE', 'FREE', 'OUT_OF_OFFICE', 'WORKING_ELSEWHERE');

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('EVENT', 'FOCUS', 'BLOCKED', 'OUT_OF_OFFICE');

-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('NONE', 'TEAMS', 'GOOGLE_MEET', 'ZOOM', 'OTHER');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('SYNC', 'VELE_MANUAL', 'VELE_AI', 'BOOKING');

-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('ATTENDEE', 'BOOKING', 'ASSISTANT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConferencingDefault" AS ENUM ('NONE', 'TEAMS', 'GOOGLE_MEET');

-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('WORKING_HOURS', 'BLOCKED', 'FOCUS');

-- CreateEnum
CREATE TYPE "PreferenceSource" AS ENUM ('SETTINGS', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "LinkVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('NONE', 'IN_PERSON', 'PHONE', 'TEAMS', 'GOOGLE_MEET', 'CUSTOM_URL');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WEB', 'TELEGRAM', 'WHATSAPP', 'SLACK', 'SMS');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'EXECUTED', 'DECLINED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TELEGRAM', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'LOGGED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MessagingProviderId" AS ENUM ('TELEGRAM', 'WHATSAPP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMPTZ(3),
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "locale" TEXT NOT NULL DEFAULT 'en-GB',
    "timeFormat" TEXT NOT NULL DEFAULT '24h',
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "onboardedAt" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalendarProviderId" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusMessage" TEXT,
    "lastSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_credentials" (
    "id" TEXT NOT NULL,
    "calendarAccountId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "oauth_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerCalendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "providerColor" TEXT,
    "timezone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "includeInAvailability" BOOLEAN NOT NULL DEFAULT true,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syncCursor" TEXT,
    "syncWindowStart" TIMESTAMPTZ(3),
    "syncWindowEnd" TIMESTAMPTZ(3),
    "lastSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "provider" "CalendarProviderId" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "iCalUid" TEXT,
    "providerVersion" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "meetingUrl" TEXT,
    "meetingProvider" "MeetingProvider" NOT NULL DEFAULT 'NONE',
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT,
    "endDate" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'CONFIRMED',
    "showAs" "EventShowAs" NOT NULL DEFAULT 'BUSY',
    "kind" "EventKind" NOT NULL DEFAULT 'EVENT',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "selfResponse" TEXT,
    "organizer" JSONB,
    "attendees" JSONB,
    "isRecurringMaster" BOOLEAN NOT NULL DEFAULT false,
    "recurrence" TEXT[],
    "recurringEventId" TEXT,
    "originalStartTime" TIMESTAMPTZ(3),
    "source" "EventSource" NOT NULL DEFAULT 'SYNC',
    "bookingId" TEXT,
    "lastSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_attendees" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "responseStatus" TEXT,
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'ATTENDEE',
    "meetingCount" INTEGER NOT NULL DEFAULT 0,
    "lastMetAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bufferBeforeMin" INTEGER NOT NULL DEFAULT 5,
    "bufferAfterMin" INTEGER NOT NULL DEFAULT 10,
    "minimumNoticeMin" INTEGER NOT NULL DEFAULT 120,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
    "maxMeetingsPerDay" INTEGER,
    "maxConsecutiveMeetings" INTEGER,
    "defaultDurationMin" INTEGER NOT NULL DEFAULT 30,
    "slotIntervalMin" INTEGER NOT NULL DEFAULT 15,
    "lunchStart" TEXT DEFAULT '12:30',
    "lunchEnd" TEXT DEFAULT '13:30',
    "preferredStart" TEXT,
    "preferredEnd" TEXT,
    "noMeetingsBefore" TEXT,
    "noMeetingsAfter" TEXT,
    "preferredDays" INTEGER[],
    "treatTentativeAsBusy" BOOLEAN NOT NULL DEFAULT true,
    "defaultCalendarId" TEXT,
    "defaultConferencing" "ConferencingDefault" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scheduling_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AvailabilityKind" NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "statement" TEXT,
    "source" "PreferenceSource" NOT NULL DEFAULT 'ASSISTANT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "welcomeMessage" TEXT,
    "visibility" "LinkVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_types" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL,
    "locationType" "LocationType" NOT NULL DEFAULT 'NONE',
    "locationValue" TEXT,
    "bufferBeforeMin" INTEGER,
    "bufferAfterMin" INTEGER,
    "minimumNoticeMin" INTEGER,
    "maxAdvanceDays" INTEGER,
    "maxPerDay" INTEGER,
    "slotIntervalMin" INTEGER,
    "availabilityOverride" JSONB,
    "conflictCalendarIds" TEXT[],
    "destinationCalendarId" TEXT,
    "visibility" "LinkVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "meeting_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "meetingTypeId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "title" TEXT NOT NULL,
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "inviteeTimezone" TEXT NOT NULL,
    "message" TEXT,
    "locationType" "LocationType" NOT NULL DEFAULT 'NONE',
    "locationValue" TEXT,
    "meetingUrl" TEXT,
    "manageTokenHash" TEXT NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "cancelledBy" TEXT,
    "rescheduledToId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_invites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "meetingTypeId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "singleUse" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'WEB',
    "title" TEXT,
    "lastMessageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "ui" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_actions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channel" "Channel" NOT NULL DEFAULT 'WEB',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "iterations" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" JSONB,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarAccountId" TEXT NOT NULL,
    "calendarId" TEXT,
    "provider" "CalendarProviderId" NOT NULL,
    "providerSubscriptionId" TEXT NOT NULL,
    "resourceId" TEXT,
    "resource" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastNotificationAt" TIMESTAMPTZ(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarAccountId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eventsUpserted" INTEGER NOT NULL DEFAULT 0,
    "eventsDeleted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "error" TEXT,
    "previewHtml" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "MessagingProviderId" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_link_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "MessagingProviderId" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "calendar_accounts_userId_idx" ON "calendar_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_accounts_userId_provider_providerAccountId_key" ON "calendar_accounts"("userId", "provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_credentials_calendarAccountId_key" ON "oauth_credentials"("calendarAccountId");

-- CreateIndex
CREATE INDEX "calendars_userId_idx" ON "calendars"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "calendars_accountId_providerCalendarId_key" ON "calendars"("accountId", "providerCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_bookingId_key" ON "calendar_events"("bookingId");

-- CreateIndex
CREATE INDEX "calendar_events_userId_startTime_idx" ON "calendar_events"("userId", "startTime");

-- CreateIndex
CREATE INDEX "calendar_events_userId_endTime_idx" ON "calendar_events"("userId", "endTime");

-- CreateIndex
CREATE INDEX "calendar_events_userId_isRecurringMaster_idx" ON "calendar_events"("userId", "isRecurringMaster");

-- CreateIndex
CREATE INDEX "calendar_events_userId_recurringEventId_idx" ON "calendar_events"("userId", "recurringEventId");

-- CreateIndex
CREATE INDEX "calendar_events_userId_iCalUid_idx" ON "calendar_events"("userId", "iCalUid");

-- CreateIndex
CREATE INDEX "calendar_events_providerEventId_idx" ON "calendar_events"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_calendarId_providerEventId_key" ON "calendar_events"("calendarId", "providerEventId");

-- CreateIndex
CREATE INDEX "event_attendees_userId_email_idx" ON "event_attendees"("userId", "email");

-- CreateIndex
CREATE INDEX "event_attendees_userId_name_idx" ON "event_attendees"("userId", "name");

-- CreateIndex
CREATE INDEX "event_attendees_eventId_idx" ON "event_attendees"("eventId");

-- CreateIndex
CREATE INDEX "contacts_userId_name_idx" ON "contacts"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_userId_email_key" ON "contacts"("userId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_preferences_userId_key" ON "scheduling_preferences"("userId");

-- CreateIndex
CREATE INDEX "availability_rules_userId_kind_idx" ON "availability_rules"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key_key" ON "user_preferences"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "booking_profiles_userId_key" ON "booking_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_profiles_handle_key" ON "booking_profiles"("handle");

-- CreateIndex
CREATE INDEX "meeting_types_userId_idx" ON "meeting_types"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_types_userId_slug_key" ON "meeting_types"("userId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_manageTokenHash_key" ON "bookings"("manageTokenHash");

-- CreateIndex
CREATE INDEX "bookings_userId_startTime_idx" ON "bookings"("userId", "startTime");

-- CreateIndex
CREATE INDEX "bookings_inviteeEmail_idx" ON "bookings"("inviteeEmail");

-- CreateIndex
CREATE UNIQUE INDEX "booking_invites_tokenHash_key" ON "booking_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "booking_invites_userId_idx" ON "booking_invites"("userId");

-- CreateIndex
CREATE INDEX "conversations_userId_lastMessageAt_idx" ON "conversations"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversation_messages_conversationId_createdAt_idx" ON "conversation_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "pending_actions_userId_status_idx" ON "pending_actions"("userId", "status");

-- CreateIndex
CREATE INDEX "ai_runs_userId_createdAt_idx" ON "ai_runs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_runs_createdAt_idx" ON "ai_runs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_subscriptions_providerSubscriptionId_key" ON "webhook_subscriptions"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_userId_idx" ON "webhook_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_expiresAt_status_idx" ON "webhook_subscriptions"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "sync_runs_userId_startedAt_idx" ON "sync_runs"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "sync_runs_startedAt_idx" ON "sync_runs"("startedAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_bookingId_idx" ON "notifications"("bookingId");

-- CreateIndex
CREATE INDEX "messaging_identities_userId_idx" ON "messaging_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_identities_provider_externalUserId_key" ON "messaging_identities"("provider", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_link_codes_codeHash_key" ON "messaging_link_codes"("codeHash");

-- CreateIndex
CREATE INDEX "messaging_link_codes_userId_idx" ON "messaging_link_codes"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_resetAt_idx" ON "rate_limit_buckets"("resetAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_accounts" ADD CONSTRAINT "calendar_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_credentials" ADD CONSTRAINT "oauth_credentials_calendarAccountId_fkey" FOREIGN KEY ("calendarAccountId") REFERENCES "calendar_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "calendar_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_preferences" ADD CONSTRAINT "scheduling_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_profiles" ADD CONSTRAINT "booking_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_types" ADD CONSTRAINT "meeting_types_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "meeting_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_invites" ADD CONSTRAINT "booking_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_invites" ADD CONSTRAINT "booking_invites_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "meeting_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_calendarAccountId_fkey" FOREIGN KEY ("calendarAccountId") REFERENCES "calendar_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_calendarAccountId_fkey" FOREIGN KEY ("calendarAccountId") REFERENCES "calendar_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_identities" ADD CONSTRAINT "messaging_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_link_codes" ADD CONSTRAINT "messaging_link_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database-level double-booking protection: two CONFIRMED bookings for the same
-- host can never overlap, whatever the application code does.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("userId" WITH =, tstzrange("startTime", "endTime", '[)') WITH &&)
  WHERE ("status" = 'CONFIRMED');

-- Sanity: an event or booking can never end before it starts.
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_time_order" CHECK ("endTime" >= "startTime");
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_order" CHECK ("endTime" > "startTime");
