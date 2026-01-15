import requests
from bs4 import BeautifulSoup
import time
import csv
import json
import re
import random
import schedule
from datetime import datetime, timedelta
from requests.exceptions import ConnectionError, Timeout


# ======================================================
# 0. HEADERS ANTI-BAN + ROTATION USER-AGENT
# ======================================================

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
]

def make_headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept-Language": "fr-FR, fr;q=0.9, en;q=0.8",
        "Accept": "*/*",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "DNT": "1",
    }


BASE_URL = "https://www.linkedin.com/jobs/search"


# ======================================================
# 1. CONSTRUIRE L'URL (LUXE / DATA + FRANCE)
# ======================================================

KEYWORDS_LIST = [
    "Client Insights Analyst",
    "Web Analyst OR Digital Analyst",
    "Brand Manager"
]

def build_url(page, keywords):
    params = (
        f"?keywords={keywords}"
        "&location=France"
        "&f_TPR=r2592000"
        "&trk=public_jobs_jobs-search-bar_search-submit"
        f"&start={page * 25}"
    )
    return BASE_URL + params


# ======================================================
# 2. PAGINATION ILLIMITÉE
# ======================================================

def get_all_job_urls(keywords, max_pages=999):
    all_urls = set()
    page = 0

    while True:
        url = build_url(page, keywords)
        print(f"📄 Page {page} [{keywords}] → {url}")

        res = requests.get(url, headers=make_headers(), timeout=5)
        soup = BeautifulSoup(res.text, "html.parser")

        cards = soup.select(
            '[data-tracking-control-name="public_jobs_jserp-result_search-card"]'
        )

        if not cards:
            print("🛑 Fin de pagination.")
            break

        for tag in cards:
            href = tag.get("href")
            if href and href.startswith("https"):
                all_urls.add(href)

        print(f"   → Total URLs cumulées : {len(all_urls)}")

        page += 1
        time.sleep(random.uniform(0.5, 1.5))

        if page >= max_pages:
            break

    return list(all_urls)


# ======================================================
# 3. RETRY ANTI-BAN
# ======================================================

def fetch_with_retry(url, retries=5):
    delay = 1.5

    for attempt in range(1, retries + 1):
        try:
            res = requests.get(url, headers=make_headers(), timeout=5)
            if res.status_code in [200, 304]:
                return res.text
        except (ConnectionError, Timeout):
            pass

        time.sleep(delay + random.uniform(0, 0.5))
        delay *= 1.5

    print(f"⛔ Abandon scraping : {url}")
    return None


# ======================================================
# 4. CONVERTIR “IL Y A X” EN DATE
# ======================================================

def convert_relative_date(text):
    if not text:
        return ""

    text = text.lower()
    now = datetime.now()
    nums = re.findall(r"\d+", text)

    if not nums:
        return now.strftime("%Y-%m-%d")

    n = int(nums[0])

    if "heure" in text:
        d = now - timedelta(hours=n)
    elif "jour" in text:
        d = now - timedelta(days=n)
    elif "semaine" in text:
        d = now - timedelta(weeks=n)
    elif "mois" in text:
        d = now - timedelta(days=30 * n)
    else:
        d = now

    return d.strftime("%Y-%m-%d")


# ======================================================
# 5. SCRAPING D'UNE OFFRE
# ======================================================

def scrape_job(url):
    html = fetch_with_retry(url)
    if not html:
        return None

    soup = BeautifulSoup(html, "html.parser")
    title = soup.select_one("h1")
    if not title:
        return None

    def safe(sel):
        el = soup.select_one(sel)
        return el.get_text(strip=True) if el else ""

    job = {
        "url": url,
        "title": title.get_text(strip=True),
        "company": safe('[data-tracking-control-name="public_jobs_topcard-org-name"]'),
        "location": safe(".topcard__flavor--bullet"),
        "date_posted": convert_relative_date(safe(".posted-time-ago__text")),
        "description": safe(".description__text .show-more-less-html"),
        "seniority_level": "",
    }

    for block in soup.select(".description__job-criteria-list li"):
        name = block.select_one(".description__job-criteria-subheader")
        value = block.select_one(".description__job-criteria-text")
        if name and value and "Seniority" in name.text:
            job["seniority_level"] = value.text.strip()

    return job


# ======================================================
# 6. MASTER DATASETS (INCRÉMENTAL)
# ======================================================

def append_master_json(job):
    try:
        with open("master_raw.json", "r", encoding="utf-8") as f:
            master = json.load(f)
    except:
        master = []

    if not any(j["url"] == job["url"] for j in master):
        master.append(job)
        with open("master_raw.json", "w", encoding="utf-8") as f:
            json.dump(master, f, ensure_ascii=False, indent=4)


def append_master_csv(job_id, job):
    file = "master_clean.csv"

    try:
        open(file, "r")
    except:
        with open(file, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, delimiter="\t")
            writer.writerow([
                "id", "title", "company", "country", "location",
                "link", "date_posted", "description", "seniority_level"
            ])

    with open(file, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter="\t")
        writer.writerow([
            job_id,
            job["title"],
            job["company"],
            "France",
            job["location"],
            job["url"],
            job["date_posted"],
            job["description"],
            job["seniority_level"],
        ])


# ======================================================
# 7. PIPELINE COMPLET (IDS À PARTIR DE 4523)
# ======================================================

def run_monthly_scraper():
    print("\n🚀 Scraping BRAND / WEB / CLIENT INSIGHTS — FRANCE")

    global_id = 4522  # → premier ID écrit = 4523

    for keywords in KEYWORDS_LIST:
        print(f"\n🔍 Requête : {keywords}")
        urls = get_all_job_urls(keywords)
        print(f"➡️ {len(urls)} offres trouvées")

        for url in urls:
            global_id += 1
            print(f"➕ [{global_id}] {url}")

            job = scrape_job(url)
            if job:
                append_master_json(job)
                append_master_csv(global_id, job)

            time.sleep(random.uniform(0.6, 1.5))

    print("\n🎉 Scraping terminé.")


# ======================================================
# 8. LANCEMENT
# ======================================================

if __name__ == "__main__":
    run_monthly_scraper()
