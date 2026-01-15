Flask-based platform to explore the data job market using scraped job postings that are cleaned and visualized interactively (dashboards, advanced filters, semantic map).

1. Structure
app.py: Flask application, defines routes for all pages.

templates/: HTML pages (index, Big Picture, Job Explorer, Data Job Observatory, Interactive Job Map).

static/: CSS, JS (D3, filtering and chart logic), images, videos.

data.py / pipeline.py: dataset loading, cleaning and normalization

data_cluster.py: applies BERTopic to a dataset of job postings to extract semantic topics, project documents into a 2D UMAP space, and generate two structured CSV files (topics_bertopic.csv and jobs_for_d3.csv) for analysis and interactive visualization.

scrap.py: scraping of job postings (raw CSV export).

import_csv.py: data import/initialization (e.g. for deployment on Render).

Datasets: provided via a Google Drive link, to be placed in the expected folder (e.g. data/). https://drive.google.com/drive/folders/1ojogPjALjwyyZnL9YKY_8YQZRcP8vUkx?usp=sharing

2. Main Pages

Homepage / Introduction
Presents the project, its objectives, the methodology (scraping, text mining, clustering, visualization), and explains the role of each analytical page in the platform.

The Big Picture
Provides a macro view of the market with global KPIs, top roles/companies, key skills, salary distribution, countries, business domains, and workplace policies.

The Job Explorer
Offers micro-level exploration of individual job postings through filters (text, salary, remote, visa, country, seniority, skills, domains) and interactive job cards with detailed modals.

The Data Job Observatory
Delivers temporal analyses: job volume over time, skill evolution by role, soft-skill dynamics, the “My Market Worth” module, and a world map of opportunities.

Interactive Job Map
Displays a UMAP-based semantic cluster map where each job is a point colored by topic, with filters (text, cluster, country, seniority) and an analytics panel (skills, domains, geography, salaries).
