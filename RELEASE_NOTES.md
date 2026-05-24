# Release Notes

Version v2.7.2 — May 23, 2026

## Heal Addon Awareness

The Healing Stats and Healing Breakdown sections now flag squad members who didn't have the arcdps heal addon loaded. You'll see a small amber alert next to their healing total and a tally at the top of each section ("N partial").

Hover the alert for the why: their number is real but only a slice — EI can reconstruct some healing from addon-equipped squadmates' incoming events, but heals delivered to other non-addon players go uncounted. So when you see a Druid with "low" healing and a partial marker, it's not that they did nothing — it's that the data is incomplete.

NOTE: This won't change anyone's actual healing output, just makes it clear when the number you're looking at is a lower bound vs. a full measurement.
