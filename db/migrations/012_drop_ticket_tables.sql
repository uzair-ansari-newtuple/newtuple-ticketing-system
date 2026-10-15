-- Tickets, their photos, activity, print jobs and quality checks now live in the State Machine.
-- Neon keeps only the product catalog and the image vectors used for matching.
DROP TABLE IF EXISTS incident_images, incident_events, print_jobs, quality_checks, incidents CASCADE;
DROP SEQUENCE IF EXISTS ticket_number_seq;
