# Herods Vitalis Eilat price tracker

Tracks club-member prices for the **Executive Room** and **Executive Suite** at Herods Vitalis Eilat (a Fattal hotel). It checks two kinds of stay, then builds a Hebrew HTML report:

- **Weekend**: Thursday to Sunday, 3 nights
- **Midweek**: Sunday to Thursday, 4 nights

Prices are for 2 adults on the bed & breakfast plan, which is the price the Fattal site shows to club members by default.

No dependencies are needed, only Node.js.

## Requirements

- Node.js 18 or later, for the built-in `fetch`

## Usage

Run the three steps in order from the repository root:

```sh
node code/fetch-prices.js    # query prices and write a CSV
node code/generate-json.js   # turn the CSV into JSON with summary stats
node code/generate-html.js   # turn the JSON into an HTML report
```

Then open the HTML file from `output/` in a browser.

## How it works

| Step | Reads | Writes |
|---|---|---|
| `fetch-prices.js` | the latest CSV in `output/`, if there is one | `vitalis-prices.<stamp>.csv` |
| `generate-json.js` | the latest CSV | `vitalis-prices.<stamp>.json` |
| `generate-html.js` | the latest JSON, plus `report.css`, `report.js` and `report-body-template.html` | `vitalis-prices.<stamp>.html` |

`fetch-prices.js` checks about 43 weekly check-in dates for each stay type. It calls the GraphQL API behind the Fattal booking site and waits a random 4–10 seconds between requests.

Each run builds on the previous one. It reuses a row from the latest CSV only if that row was fetched within the last 7 days and its check-in date hasn't passed. Every other date is fetched again, so prices in the report are never more than a week old.

### Output naming

All files from one run share the same stamp: the local time the fetch started, as `YYYYMMDD_HHMM`. For example:

```
output/vitalis-prices.20261008_1444.csv
output/vitalis-prices.20261008_1444.json
output/vitalis-prices.20261008_1444.html
```

Running `generate-json.js` or `generate-html.js` again overwrites the files for that run instead of making new ones. Generated files are not committed to git; only `output/.gitkeep` is tracked.

## The report

The HTML report is a single self-contained file in Hebrew. It shows:

- The total price and the price per night for each room type and stay type
- Summary stats: lowest, highest and average price, and how much more the suite costs than the room
- Weeks with no availability
- The full table of results

## Project layout

```
code/
  fetch-prices.js            query the booking API and write the CSV
  generate-json.js           work out the summary stats and write the JSON
  generate-html.js           build the HTML report
  output-paths.js            shared output-file naming helpers
  report-body-template.html  report markup
  report.css                 report styles
  report.js                  report rendering in the browser
output/                      generated files (git-ignored)
```

## Disclaimer

This is an unofficial personal project. It is not affiliated with or endorsed by Fattal Hotels or Herods. It uses the public API that the Fattal booking site calls from your browser, and that API may change or stop working at any time. Prices are for reference only; check the official site before booking. Please keep the request rate low.
