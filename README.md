Flask-based platform to explore the data job market using scraped job postings that are cleaned and visualized interactively (dashboards, advanced filters, semantic map).

Structure
app.py: Flask application, defines routes for all pages.

templates/: HTML pages (index, Big Picture, Job Explorer, Data Job Observatory, Interactive Job Map).

static/: CSS, JS (D3, filtering and chart logic), images, videos.

data.py / pipeline.py: dataset loading, cleaning, normalization, and preparation of tables for API endpoints.

scrap.py: scraping of job postings (raw CSV export).

import_csv.py: data import/initialization (e.g. for deployment on Render).

Datasets: provided via a Google Drive link, to be placed in the expected folder (e.g. data/).
