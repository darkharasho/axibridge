# Release Notes

Version v3.13.0 — September 19, 2026

## Logs in subfolders are visible again

If your arcdps folder is bucketed into per-encounter subdirectories, the "add logs" picker used to open to an empty list — it only ever read the top level, even though the live watcher has always walked the tree. It now walks the same depth the watcher does, and each row shows the folder it came from so two logs with the same filename stay tellable apart.

## Picker search covers the whole folder

The search box used to filter only the logs already loaded into the picker's rolling window. Typing the name of an older fight read as "no such log" when it just wasn't loaded yet. Search now runs over every log in the folder, and "Load older logs" hides while you're searching since the results already span everything.

## Reports say when a log didn't make it in

A 51-fight report could publish totals over 45 of them without a word. Logs whose details couldn't be read back showed up as a "--" row with an odd duration, sorted to the end, contributing nothing to any total. Those rows now carry a real start time (recovered from the filename and the fight length) and the coverage banner names the logs that were left out, with the same re-parse button that fixes them.

## Fewer logs go missing in the first place

The details cache used to mark a log as cached the moment it hit memory, whether or not the write to durable storage actually landed. When the browser store rejected a write, the log quietly disappeared from every total once memory filled up. A log is only recorded as cached once the write lands; otherwise it gets retried, and if the store keeps refusing, the log shows up in the coverage banner instead of vanishing.

NOTE: reports already published are unchanged — this affects reports you build from here on.

## Fixes

- Picker rows no longer sit ragged when only some logs in a folder are nested.
