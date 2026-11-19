-- CreateIndex
CREATE INDEX "calendar_events_title_trgm" ON "calendar_events" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "calendar_events_location_trgm" ON "calendar_events" USING GIN ("location" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "event_attendees_name_trgm" ON "event_attendees" USING GIN ("name" gin_trgm_ops);
