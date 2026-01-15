import os
import pandas as pd
import psycopg2
from psycopg2.extras import Json
import ast
import re

# ---------------------------------------------------------
# CONFIGURATION INTERACTIVE
# ---------------------------------------------------------
print("--- CONFIGURATION ---")
print("Colle ton External Database URL ci-dessous et appuie sur Entrée :")
DATABASE_URL = input().strip()

# Petite correction automatique si le lien commence par postgresql://
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgres://", 1)

# Chemins des fichiers
STATS_PATH = "data/job_data_clean.csv"
D3_PATH = "data/jobs_for_d3.csv"

# ---------------------------------------------------------
# FONCTIONS DE NETTOYAGE
# ---------------------------------------------------------
_SPLIT_RE = re.compile(r"[;,\|]") 

def to_bool(v):
    if v is None or (isinstance(v, float) and pd.isna(v)): return False
    if isinstance(v, bool): return v
    s = str(v).strip().lower()
    return s in {"true", "1", "yes", "y", "oui"}

def to_float(v):
    try:
        if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
            return None
        return float(v)
    except Exception:
        return None

def to_list(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v == "": return []
    if isinstance(v, list): return [str(x).strip() for x in v if str(x).strip()]
    s = str(v).strip()
    if not s or s == "[]": return []
    if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, (list, tuple)): return [str(x).strip() for x in parsed if str(x).strip()]
        except: pass
    parts = [p.strip().strip("'").strip('"') for p in _SPLIT_RE.split(s)]
    return [p for p in parts if p]

# ---------------------------------------------------------
# SCRIPT PRINCIPAL
# ---------------------------------------------------------
def upload_data():
    if not DATABASE_URL:
        print("ERREUR: URL vide.")
        return

    print("Connexion à PostgreSQL...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
    except Exception as e:
        print(f"Erreur de connexion : {e}")
        return

    # =========================================================
    # 1. TABLE JOBS
    # =========================================================
    print(f"Lecture et nettoyage de {STATS_PATH}...")
    df = pd.read_csv(STATS_PATH, on_bad_lines="skip")
    
    # --- CORRECTION : AJOUT DES COLONNES MANQUANTES ---
    expected_cols = [
        "title", "company", "country", "location", "link", "source",
        "date_posted", "description", "description_sans_html",
        "technical_skills", "tools_used", "soft_skills",
        "education_level", "seniority_level",
        "benefits", "eeo_statement",
        "hybrid_policy", "visa_sponsorship",
        "tasks", "domains",
        "tone_culture", "eeo_terms",
        "experience_mentions", "salary_value", "salary_type", "salary_currency",
        "experience_years"
    ]

    # Si une colonne n'existe pas dans le CSV, on la crée avec du vide
    for col in expected_cols:
        if col not in df.columns:
            df[col] = ""
    
    # On remplit les NaNs
    df = df.fillna("")

    # Création table
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
            experience_mentions TEXT, salary_value FLOAT, salary_type TEXT, salary_currency TEXT,
            experience_years FLOAT
        );
    """)

    print("Insertion des données dans 'jobs'...")
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
                experience_mentions, salary_value, salary_type, salary_currency,
                experience_years
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            row["title"], row["company"], row["country"], row["location"], row["link"], row["source"],
            row["date_posted"], row["description"], row["description_sans_html"],
            Json(to_list(row["technical_skills"])), Json(to_list(row["tools_used"])), Json(to_list(row["soft_skills"])),
            row["education_level"], row["seniority_level"],
            Json(to_list(row["benefits"])), row["eeo_statement"],
            to_bool(row["hybrid_policy"]), to_bool(row["visa_sponsorship"]),
            Json(to_list(row["tasks"])), Json(to_list(row["domains"])),
            Json(to_list(row["tone_culture"])), Json(to_list(row["eeo_terms"])),
            row["experience_mentions"], # Maintenant cette colonne existe forcément
            to_float(row["salary_value"]), 
            row["salary_type"], row["salary_currency"],
            to_float(row["experience_years"]) 
        ))

    # =========================================================
    # 2. TABLE D3_DATA
    # =========================================================
    print(f"Lecture et nettoyage de {D3_PATH}...")
    df_d3 = pd.read_csv(D3_PATH, on_bad_lines="skip")
    df_d3 = df_d3.fillna("")

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

    print("Insertion des données dans 'd3_data'...")
    for _, row in df_d3.iterrows():
        skills = row.get("skills_tech", "")
        if not skills: skills = row.get("topic_keywords", "")
        
        cur.execute("""
            INSERT INTO d3_data (title, x_umap, y_umap, salary_value, skills_tech, topic_keywords, domains)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            row.get("title", ""), 
            to_float(row.get("x_umap")), 
            to_float(row.get("y_umap")),
            to_float(row.get("salary_value")), 
            str(skills), 
            str(row.get("topic_keywords", "")),
            Json(to_list(row.get("domains")))
        ))

    conn.commit()
    cur.close()
    conn.close()
    print("\n---------------------------------------------------")
    print("✅ MIGRATION RÉUSSIE ! Toutes les données sont sur Render.")
    print("---------------------------------------------------")

if __name__ == "__main__":
    upload_data()