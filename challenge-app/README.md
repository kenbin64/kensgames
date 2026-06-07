# DealForge

**A revenue-operations workbench that runs entirely in your browser. Build quotes, estimate ROI, forecast your pipeline, and check margins without sending a single number to anyone.**

## The problem

Small teams run their deal math in fragile spreadsheets, or in expensive SaaS tools that make you create an account, upload your pricing and customer data to someone else's cloud, and then hide the actual logic behind a black box. You cannot see how the margin or the forecast is calculated, and your most sensitive numbers leave your control the moment you type them.

## The solution

DealForge does the core revenue-ops math on a single web page:

- **Quote builder** with discount, tax, delivery cost, and margin
- **ROI estimator** with payback period
- **Weighted pipeline forecast**
- **Local save** plus JSON export and import

No account, no upload, no install. Open the page and work.

## Why you need this

- **See the math.** Every number (margin, payback, weighted forecast) is computed in readable JavaScript you can open and check, not hidden behind a vendor's API.
- **Keep your data.** Pricing, customers, and pipeline are yours and stay on your machine.
- **Own it.** Export everything to JSON whenever you want. Nothing holds your data hostage.

## Why trust this

- **It runs 100% in your browser.** The whole app is the plain HTML, CSS, and JavaScript in this folder. Use View Source, or just read [app.js](app.js). There is no black box.
- **Your data never leaves the page.** It is saved in your browser's `localStorage` and exported only when you click export. There is no server, no account, no analytics, and no tracking of any kind.
- **One honest exception:** [index.html](index.html) loads a web font from Google Fonts for appearance only. Delete the three `<link>` font lines at the top of the file to run completely offline. The app's logic and your data do not depend on it.
- **Open to inspect, fork, and change.** It is a few small, readable files. Nothing is compiled or obfuscated.

## Run it

No build step. Serve the folder and open it:

```bash
# from the repository root
python -m http.server 8000
# then open http://localhost:8000/challenge-app/
```

Or open [index.html](index.html) directly in a browser.

## Files

- `index.html` - the app shell
- `app.js` - all the logic (quotes, ROI, forecast, persistence)
- `styles.css` - styling

## Note

This is a portfolio demonstration of clean, transparent, browser-only application design, not a commercial product. It is intentionally self-contained so anyone can read every line and verify exactly what it does with their data.
