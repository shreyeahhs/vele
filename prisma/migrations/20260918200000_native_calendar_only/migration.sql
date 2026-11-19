-- AlterEnum
BEGIN;
CREATE TYPE "Channel_new" AS ENUM ('WEB', 'TELEGRAM', 'WHATSAPP');
ALTER TABLE "public"."ai_runs" ALTER COLUMN "channel" DROP DEFAULT;
ALTER TABLE "public"."conversations" ALTER COLUMN "channel" DROP DEFAULT;
ALTER TABLE "conversations" ALTER COLUMN "channel" TYPE "Channel_new" USING ("channel"::text::"Channel_new");
ALTER TABLE "ai_runs" ALTER COLUMN "channel" TYPE "Channel_new" USING ("channel"::text::"Channel_new");
ALTER TYPE "Channel" RENAME TO "Channel_old";
ALTER TYPE "Channel_new" RENAME TO "Channel";
DROP TYPE "public"."Channel_old";
ALTER TABLE "ai_runs" ALTER COLUMN "channel" SET DEFAULT 'WEB';
ALTER TABLE "conversations" ALTER COLUMN "channel" SET DEFAULT 'WEB';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "EventShowAs_new" AS ENUM ('BUSY', 'TENTATIVE', 'FREE', 'OUT_OF_OFFICE');
ALTER TABLE "public"."calendar_events" ALTER COLUMN "showAs" DROP DEFAULT;
ALTER TABLE "calendar_events" ALTER COLUMN "showAs" TYPE "EventShowAs_new" USING ("showAs"::text::"EventShowAs_new");
ALTER TYPE "EventShowAs" RENAME TO "EventShowAs_old";
ALTER TYPE "EventShowAs_new" RENAME TO "EventShowAs";
DROP TYPE "public"."EventShowAs_old";
ALTER TABLE "calendar_events" ALTER COLUMN "showAs" SET DEFAULT 'BUSY';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "EventSource_new" AS ENUM ('MANUAL', 'ASSISTANT', 'BOOKING');
ALTER TABLE "public"."calendar_events" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "calendar_events" ALTER COLUMN "source" TYPE "EventSource_new" USING ("source"::text::"EventSource_new");
ALTER TYPE "EventSource" RENAME TO "EventSource_old";
ALTER TYPE "EventSource_new" RENAME TO "EventSource";
DROP TYPE "public"."EventSource_old";
ALTER TABLE "calendar_events" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "LocationType_new" AS ENUM ('NONE', 'IN_PERSON', 'PHONE', 'VIDEO_LINK');
ALTER TABLE "public"."bookings" ALTER COLUMN "locationType" DROP DEFAULT;
ALTER TABLE "public"."meeting_types" ALTER COLUMN "locationType" DROP DEFAULT;
ALTER TABLE "meeting_types" ALTER COLUMN "locationType" TYPE "LocationType_new" USING ("locationType"::text::"LocationType_new");
ALTER TABLE "bookings" ALTER COLUMN "locationType" TYPE "LocationType_new" USING ("locationType"::text::"LocationType_new");
ALTER TYPE "LocationType" RENAME TO "LocationType_old";
ALTER TYPE "LocationType_new" RENAME TO "LocationType";
DROP TYPE "public"."LocationType_old";
ALTER TABLE "bookings" ALTER COLUMN "locationType" SET DEFAULT 'NONE';
ALTER TABLE "meeting_types" ALTER COLUMN "locationType" SET DEFAULT 'NONE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationChannel_new" AS ENUM ('EMAIL', 'TELEGRAM', 'WHATSAPP');
ALTER TABLE "notifications" ALTER COLUMN "channel" TYPE "NotificationChannel_new" USING ("channel"::text::"NotificationChannel_new");
ALTER TYPE "NotificationChannel" RENAME TO "NotificationChannel_old";
ALTER TYPE "NotificationChannel_new" RENAME TO "NotificationChannel";
DROP TYPE "public"."NotificationChannel_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "calendar_accounts" DROP CONSTRAINT "calendar_accounts_userId_fkey";

-- DropForeignKey
ALTER TABLE "calendars" DROP CONSTRAINT "calendars_accountId_fkey";

-- DropForeignKey
ALTER TABLE "oauth_credentials" DROP CONSTRAINT "oauth_credentials_calendarAccountId_fkey";

-- DropForeignKey
ALTER TABLE "sync_runs" DROP CONSTRAINT "sync_runs_calendarAccountId_fkey";

-- DropForeignKey
ALTER TABLE "sync_runs" DROP CONSTRAINT "sync_runs_userId_fkey";

-- DropForeignKey
ALTER TABLE "webhook_subscriptions" DROP CONSTRAINT "webhook_subscriptions_calendarAccountId_fkey";

-- DropForeignKey
ALTER TABLE "webhook_subscriptions" DROP CONSTRAINT "webhook_subscriptions_calendarId_fkey";

-- DropForeignKey
ALTER TABLE "webhook_subscriptions" DROP CONSTRAINT "webhook_subscriptions_userId_fkey";

-- DropIndex
DROP INDEX "calendar_events_calendarId_providerEventId_key";

-- DropIndex
DROP INDEX "calendar_events_providerEventId_idx";

-- DropIndex
DROP INDEX "calendar_events_userId_iCalUid_idx";

-- DropIndex
DROP INDEX "calendar_events_userId_recurringEventId_idx";

-- DropIndex
DROP INDEX "calendars_accountId_providerCalendarId_key";

-- AlterTable
ALTER TABLE "ai_runs" DROP COLUMN "cacheReadTokens",
DROP COLUMN "cacheWriteTokens",
ADD COLUMN     "thoughtTokens" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "calendar_events" DROP COLUMN "attendees",
DROP COLUMN "lastSyncedAt",
DROP COLUMN "organizer",
DROP COLUMN "provider",
DROP COLUMN "providerEventId",
DROP COLUMN "providerVersion",
DROP COLUMN "recurringEventId",
DROP COLUMN "selfResponse",
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seriesId" TEXT,
ALTER COLUMN "iCalUid" SET NOT NULL,
ALTER COLUMN "timezone" SET NOT NULL,
ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "calendars" DROP COLUMN "accountId",
DROP COLUMN "isPrimary",
DROP COLUMN "isReadOnly",
DROP COLUMN "lastSyncedAt",
DROP COLUMN "providerCalendarId",
DROP COLUMN "providerColor",
DROP COLUMN "syncCursor",
DROP COLUMN "syncEnabled",
DROP COLUMN "syncWindowEnd",
DROP COLUMN "syncWindowStart",
DROP COLUMN "timezone",
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "meetingCount",
ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "event_attendees" DROP COLUMN "isOrganizer",
DROP COLUMN "responseStatus";

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "previewHtml",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payload" JSONB;

-- AlterTable
ALTER TABLE "scheduling_preferences" DROP COLUMN "defaultConferencing",
ADD COLUMN     "defaultVideoLink" TEXT;

-- DropTable
DROP TABLE "calendar_accounts";

-- DropTable
DROP TABLE "oauth_credentials";

-- DropTable
DROP TABLE "sync_runs";

-- DropTable
DROP TABLE "webhook_subscriptions";

-- DropEnum
DROP TYPE "CalendarProviderId";

-- DropEnum
DROP TYPE "ConferencingDefault";

-- DropEnum
DROP TYPE "ConnectionStatus";

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_iCalUid_key" ON "calendar_events"("iCalUid");

-- CreateIndex
CREATE INDEX "calendar_events_userId_seriesId_idx" ON "calendar_events"("userId", "seriesId");

-- CreateIndex
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt");

