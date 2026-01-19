import os
import pandas as pd
import psycopg2
from psycopg2.extras import Json
import ast
import re

# INTERACTIVE CONFIGURATION
print("--- CONFIGURATION ---")
print("Paste your External Database URL and press Enter:")
DATABASE_URL = input().strip()

# Normalize PostgreSQL scheme (Render compatibility)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgres://", 1)

# File paths
STATS_PATH = "data/job_data_clean.csv"
D3_PATH = "data/jobs_for_d3.csv"

# DATA CLEANING HELPERS
_SPLIT_RE = re.compile(r"[;,\|]")


def to_bool(value):
    """Convert various truthy/falsy representations to boolean."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "y", "oui"}


def to_float(value):
    """Safely convert to float or return None."""
    try:
        if value is None or (isinstance(value, float) and pd.isna(value)) or value == "":
            return None
        return float(value)
    except Exception:
        return None


def to_list(value):
    """Normalize string / list / tuple representations into a clean list."""
    if value is None or (isinstance(value, float) and pd.isna(value)) or value == "":
        return []

    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]

    s = str(value).strip()
    if not s or s in {"[]", "()"}:
        return []

    # Try literal list/tuple parsing
    if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, (list, tuple)):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass

    # Fallback: split on common separators
    parts = [p.strip().strip("'").strip('"') for p in _SPLIT_RE.split(s)]
    return [p for p in parts if p]



# MAIN SCRIPT

def upload_data():
    if not DATABASE_URL:
        print("ERROR: Empty database URL.")
        return

    print("Connecting to PostgreSQL...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
    except Exception as e:
        print(f"Connection error: {e}")
        return

    # 1. JOBS TABLE
    print(f"Loading and cleaning {STATS_PATH}...")
    df = pd.read_csv(STATS_PATH, on_bad_lines="skip")

    expected_cols = [
        "title", "company", "country", "location", "link", "source",
        "date_posted", "description", "description_sans_html",
        "technical_skills", "tools_used", "soft_skills",
        "education_level", "seniority_level",
        "benefits", "eeo_statement",
        "hybrid_policy", "visa_sponsorship",
        "tasks", "domains",
        "tone_culture", "eeo_terms",
        "experience_mentions",
        "salary_value", "salary_type", "salary_currency",
        "experience_years",
    ]

    # Ensure schema consistency
    for col in expected_cols:
        if col not in df.columns:
            df[col] = ""

    df = df.fillna("")

    cur.execute("DROP TABLE IF EXISTS jobs CASCADE;")
    cur.execute("""
        CREATE TABLE jobs (
            id SERIAL PRIMARY KEY,
            title TEXT, company TEXT, country TEXT, location TEXT, link TEXT, source TEXT,
            date_posted TEXT, description TEXT, description_sans_html TEXT,
            technical_skills JSONB, tools_used JSONB, soft_skills JSONB,
            education_level TEXT, seniority_level TEXT,
            benefits JSONB, eeo_statement TEXT,
            hybrid_policy BOOLEAN, visa_sponsorship BOOLEAN,
            tasks JSONB, domains JSONB,
            tone_culture JSONB, eeo_terms JSONB,
            experience_mentions TEXT,
            salary_value FLOAT, salary_type TEXT, salary_currency TEXT,
            experience_years FLOAT
        );
    """)

    print("Inserting data into 'jobs' table...")
    for _, row in df.iterrows():
        cur.execute("""
            INSERT INTO jobs (
                title, company, country, location, link, source,
                date_posted, description, description_sans_html,
                technical_skills, tools_used, soft_skills,
                education_level, seniority_level,
                benefits, eeo_statement,
                hybrid_policy, visa_sponsorship,
                tasks, domains,
                tone_culture, eeo_terms,
                experience_mentions,
                salary_value, salary_type, salary_currency,
                experience_years
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            row["title"], row["company"], row["country"], row["location"],
            row["link"], row["source"],
            row["date_posted"], row["description"], row["description_sans_html"],
            Json(to_list(row["technical_skills"])),
            Json(to_list(row["tools_used"])),
            Json(to_list(row["soft_skills"])),
            row["education_level"], row["seniority_level"],
            Json(to_list(row["benefits"])),
            row["eeo_statement"],
            to_bool(row["hybrid_policy"]),
            to_bool(row["visa_sponsorship"]),
            Json(to_list(row["tasks"])),
            Json(to_list(row["domains"])),
            Json(to_list(row["tone_culture"])),
            Json(to_list(row["eeo_terms"])),
            row["experience_mentions"],
            to_float(row["salary_value"]),
            row["salary_type"],
            row["salary_currency"],
            to_float(row["experience_years"]),
        ))

    # 2. D3 DATA TABLE
    print(f"Loading and cleaning {D3_PATH}...")
    df_d3 = pd.read_csv(D3_PATH, on_bad_lines="skip").fillna("")

    cur.execute("DROP TABLE IF EXISTS d3_data CASCADE;")
    cur.execute("""
        CREATE TABLE d3_data (
            id SERIAL PRIMARY KEY,
            title TEXT,
            x_umap FLOAT, y_umap FLOAT,
            salary_value FLOAT,
            skills_tech TEXT, topic_keywords TEXT,
            domains JSONB
        );
    """)

    print("Inserting data into 'd3_data' table...")
    for _, row in df_d3.iterrows():
        skills = row.get("skills_tech") or row.get("topic_keywords", "")

        cur.execute("""
            INSERT INTO d3_data (
                title, x_umap, y_umap, salary_value,
                skills_tech, topic_keywords, domains
            ) VALUES (%s,%s,%s,%s,%s,%s,%s)
        """, (
            row.get("title", ""),
            to_float(row.get("x_umap")),
            to_float(row.get("y_umap")),
            to_float(row.get("salary_value")),
            str(skills),
            str(row.get("topic_keywords", "")),
            Json(to_list(row.get("domains"))),
        ))

    conn.commit()
    cur.close()
    conn.close()

    print("SUCCESS: Migration completed. Data is live on Render.")


if __name__ == "__main__":
    upload_data()
