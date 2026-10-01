# Release Notes

Version v3.19.0 — September 30, 2026

## One design language, three themes
AxiBridge now runs entirely on the shared axi design language, the same one the rest of the Axi apps use. The old theme system (Classic, Modern, CRT, Matte, Kinetic) is gone, and the handful of glass toggles that replaced it are now a single Theme setting with three choices: Default, Glass and Flat. Your previous glass setting carries over automatically, and importing an older settings file still works.

NOTE: Published web reports pick up the new look the next time you publish them from this version. Reports you already published keep the look they were published with. Share links at bridge.axi.link are already on the new look.

## Web reports and share links wear the same theme
The theme you pick in the app is carried into the report you publish, so a Glass report reads as Glass on the web and in share links, not just on your desktop.

## QoL Improvements
- Tables are keyboard-friendly: every sortable column header can be reached and sorted with the keyboard, and the dense stats grids are real tables now, so screen readers and copy-paste behave.
- Buttons, toggles, dropdowns, tooltips, inputs and the search palette all come from one set of components, so they look and behave the same on every page instead of drifting slightly from screen to screen.
- Hover and focus states are consistent everywhere, including the replay map controls, which previously had no hover or disabled state at all.
- "Back to Reports" stays pinned to the bottom of the web report's nav rail.

## Fixes
- Fixed the mobile web report showing two "Contents" buttons.
- Fixed the desktop nav rail showing up on narrow web report viewports.
- Fixed the web report's page background being painted over instead of letting the theme's ground show through.
- Fixed charts being themed twice, with the wrong pass winning under Glass.
- Fixed SVG icons picking up gradient fills under Glass.
