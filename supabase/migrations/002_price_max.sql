-- Add price_max column for listings with unit price ranges (e.g. Zillow apartment buildings)
alter table listings add column if not exists price_max integer;
