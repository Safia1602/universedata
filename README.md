This project analyzes job offers in the data field to uncover typical patterns across companies, skills, and regions. It combines descriptive statistics, text mining, and clustering methods to reveal how jobs naturally group together. The core idea is to build a living observatory that captures, structures, and visualizes market trends in real time — turning thousands of job descriptions into an intelligible map.

This project also has a deployed version on Render using the free tier: https://datauniverse.onrender.com
Due to the constraints of the free plan (limited resources, cold starts, and timeouts), the online app runs a minimal version of the project, with only about 1,000 job records and several missing columns to keep the interface responsive.
This deployed instance does not reflect the full analytical scope or data richness of the final project; it is provided mainly as a lightweight demo and may experience occasional slowness or interruptions.

For this reason, you are strongly encouraged to run the application locally to access all the intended features and the full dataset.
Simply install Flask (and the other dependencies), run app.py (or start the app with flask run), then click on the URL shown in the terminal: you will get the complete version of the site running on your own machine.

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
