# Internal Message Labeling App

Open `index.html` in a browser or use the local preview URL.

`data/labeling_queue.json`, when present, loads automatically. Otherwise the app loads `data/sample_queue.json`.

Use `supabase_labeling_export.sql` to recreate the labeling queue from Supabase as CSV/JSON.

Current live Supabase check on 2026-08-01:

- 5,495 unique student-message rows from the 19 participants with at least 2 submitted assessments
- 2,408 rows are `task_type = both`, meaning they need ICAP plus initiation scoring
- 3,087 rows are `task_type = icap`, meaning they need ICAP only
- 593 first-message rows are obvious initiation 0s and are prefilled/locked unless overridden

The app supports:

- ICAP / engagement labels: passive, active, constructive, interactive, N/A
- Initiation labels from the study rubric: 0, 0.3, 0.7, 0.75, 0.8, 1, N/A
- obvious initiation 0 values prefilled from the export query
- local browser autosave
- CSV and JSON export

No labels are written back to Supabase.
