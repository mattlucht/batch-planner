# Appointment Planner

A small internal tool for tracking batches of participants across Humberside,
Somerset and Manchester, the clinic dates that appoint people out of those
batches, and a calendar view tying the two together.

It's a static web app &mdash; plain HTML/CSS/JavaScript, no build step, no
server-side code. All data is stored in your browser's `localStorage`, so it
persists between visits on the same browser/computer, but isn't shared
automatically between people or devices. Use **Data &rarr; Export JSON** to
back up or move your data (e.g. to another computer, or to hand a snapshot to
a colleague, who can import it into their own browser).

## Running it locally

Because the app uses `localStorage`, most browsers are happiest if it's
served over `http://` rather than opened directly as a `file://` path.
From this folder, run a simple local server, e.g.:

```
python3 -m http.server 8000
```

then open **http://localhost:8000** in your browser. (Any static server
works &mdash; `npx serve`, VS Code's "Live Server" extension, etc.)

## Data model

- **Organisations**: Humberside, Somerset, Manchester (seeded automatically).
- **Batches**: organisation, batch name, batch specification date, number of
  people in the batch.
- **Clinics**: organisation, clinic date, number of appointment slots, and
  (optionally) which batch is being appointed from.

The Clinics table also shows an **Invite date** column &mdash; not stored,
just calculated as 3 weeks (21 days) before the clinic date &mdash; so it
updates automatically if you ever change a clinic's date.

The clinic form only lists batches belonging to the organisation you've
selected, to keep the org on a clinic consistent with the org on the batch
it draws from. A clinic's batch is optional, so you can pencil in a clinic
date before the batch it will draw from is finalised.

The Batches table shows, per batch, the total appointment slots allocated
across all its clinics, how many people remain un-appointed, and its
**runway** &mdash; see below.

## Calendar

The Calendar tab shows 4 months at once (2x2 on most screens, all 4 in a
row on wide monitors), with a chip for every batch specification date
(**Spec:**) and every clinic date (**Clinic:**), colour-coded by
organisation. The **&larr;** / **&rarr;** arrows slide the window one
month at a time (so consecutive clicks scroll smoothly rather than
jumping in blocks of 4); **Today** jumps back to the window starting at
the current month. Use
the organisation filter above the calendar to focus on one organisation at
a time.

- **Click a clinic chip** to open that clinic for editing.
- **Click a batch chip** to *focus* that batch. This:
  - shades the batch's **runway** on the calendar &mdash; how long it
    takes to get everyone in the batch an appointment, assuming
    **50 appointments per weekday** (Mon&ndash;Fri; weekends don't count
    towards capacity, e.g. a batch of 100 people needs 2 working days, a
    batch of 6,000 needs 120). Change `DAILY_APPOINTMENT_CAPACITY` near
    the top of `js/store.js` if 50/day isn't the right number.
  - dims everything unrelated to that batch, and highlights the batch
    itself plus any clinics already linked to it.
  - opens a panel above the calendar with the batch's details, its linked
    clinics, and a **+ Add clinic for this batch** shortcut that opens the
    clinic form pre-filled with the right organisation and batch, so you
    can drop a new clinic date straight into the batch's runway. Click the
    batch chip again (or "Clear focus" in the panel) to drop the focus.

The Batches table has a matching **Runway** column and an **On calendar**
link per row that jumps to the calendar with that batch already focused,
its first visible month, so the following 3 months give you the forward
look.

## Hosting on GitHub Pages later

Since this is a plain static site, moving it to GitHub Pages is
straightforward:

1. Push this folder to a GitHub repo.
2. In the repo's Settings &rarr; Pages, set the source to the branch/folder
   containing `index.html` (e.g. `main` / `/root`, or a `docs/` folder if
   you move things there).
3. GitHub will publish it at `https://<your-username>.github.io/<repo>/`.

One thing to know: because data lives in each visitor's own browser
`localStorage`, a GitHub Pages deployment won't automatically share data
between you and your team &mdash; each person who opens the page starts with
their own empty (or sample) data, and you'd pass data around via the
Export/Import JSON feature. If you later want everyone to see the same
live data, that needs a small backend and a real database behind it, which
would be a bigger step up from this version.

## Sample data

The Data tab has a **Load sample data** button that fills in a handful of
example batches and clinics across all three organisations, useful for
getting a feel for the calendar before you enter your own dates.
