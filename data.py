# ====================================================
# LINKEDIN_CLEAN_AND_ENRICH.PY
# Nettoyage + enrichissement regex du dataset LinkedIn
# Basé sur le pipeline original (Safia Lamri)
# ====================================================

import re
import html
import unicodedata
import pandas as pd
import numpy as np

# ====================================================
# 🔹 1. Listes et dictionnaires (depuis ton pipeline)
# ====================================================
print("RUNNING FILE:", __file__)

TECHNICAL_SKILLS = [
    "python","r","sql","java","c++","scala","javascript","typescript","bash","vba","go","matlab",
    "spark","hadoop","airflow","etl","dataflow","flume","dbt","kafka","bigquery","redshift",
    "snowflake","databricks","data warehouse","data lake","data pipeline","data modeling",
    "tableau","power bi","looker","google data studio","domo","mode","ssrs","ssas","microstrategy",
    "excel","google sheets","dashboards","data visualization","data reporting",
]

TOOLS_LIST = [
    "tableau","power bi","looker","mode","ssrs","ssas","excel","google sheets",
    "aws","azure","gcp","snowflake","databricks","bigquery","redshift","mysql",
    "postgresql","mssql","oracle","jira","confluence","lucidchart","visio"
]

SOFT_SKILLS = [
    "communication","teamwork","collaboration","leadership","problem solving",
    "critical thinking","time management","adaptability","attention to detail",
    "creativity","analytical thinking","initiative","organization",
]

EDUCATION_LEVELS = {
    "phd": ["phd","doctorate"],
    "master": ["master","msc","m.sc"],
    "bachelor": ["bachelor","bsc","bs"],
    "associate": ["associate degree"],
}

SENIORITY_LEVELS = {
    "intern": ["intern","internship"],
    "junior": ["junior","entry"],
    "mid": ["mid","ii"],
    "senior": ["senior","iii"],
    "lead": ["lead","principal"],
}

BENEFITS = [
    "bonus","equity","stock options","health insurance","pto","paid time",
    "dental","vision","life insurance"
]

DOMAINS = {
    "finance": r"finance|bank",
    "marketing": r"marketing|advertis",
    "healthcare": r"healthcare|clinic",
    "ecommerce": r"e[- ]?commerce|retail",
}

# ====================================================
# 🔹 2. Fonction cleaning texte
# ====================================================

def clean_text(text):
    """Nettoyage HTML → texte brut propre."""
    if not isinstance(text, str):
        return ""

    text = html.unescape(text)
    text = re.sub(r"<[^>]*>", " ", text)
    text = re.sub(r"http\S+|www.\S+", " ", text)
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.lower()

# ====================================================
# 🔹 3. Regex extractors
# ====================================================

def find_keywords(text, words):
    if not isinstance(text, str):
        return ""
    t = text.lower()
    found = set()
    for w in words:
        pattern = rf"\b{re.escape(w)}\b"
        if re.search(pattern, t):
            found.add(w)
    return ", ".join(sorted(found))


def match_category(text, categories):
    t = text.lower()
    for cat, variants in categories.items():
        if any(v in t for v in variants):
            return cat
    return None

def parse_salary(text):
    t = text.lower()
    nums = re.findall(r"(\d+)\s?k?", t)
    if not nums:
        return None, None, None
    vals = [int(n)*1000 if 'k' in t else int(n) for n in nums]
    if len(vals) == 1:
        return vals[0], vals[0], "annual"
    return min(vals), max(vals), "annual"

def parse_experience(text):
    m = re.search(r"(\d+)\+?\s*(years|yrs)", text)
    return int(m.group(1)) if m else None

def detect_work_mode(text):
    t = text.lower()
    if "remote" in t: return "remote"
    if "hybrid" in t: return "hybrid"
    if "on-site" in t: return "onsite"
    return None

def extract_domains(text):
    t = text.lower()
    for dom, pattern in DOMAINS.items():
        if re.search(pattern, t):
            return dom
    return None

def extract_tasks(text):
    sentences = re.split(r"[.;\n]", text)
    tasks = [s.strip() for s in sentences if re.search(r"analy|build|develop|model|report", s, re.I)]
    return " | ".join(tasks) if tasks else None

def extract_tone(text):
    t = text.lower()
    out = []
    if "fast-paced" in t: out.append("fast_paced")
    if "inclusive" in t: out.append("inclusive")
    if "collaborative" in t: out.append("collaborative")
    return ", ".join(out) if out else None

def extract_eeo_terms(text):
    terms = ["race","gender","sex","age","color","religion","disability"]
    t = text.lower()
    found = [term for term in terms if term in t]
    return ", ".join(found) if found else None

# ====================================================
# 🔹 4. PIPELINE PRINCIPAL
# ====================================================

def enrich_linkedin_dataset(input_csv="linkedin-scraper/master_clean1.csv", output_csv="data.csv"):
    df = pd.read_csv(
    input_csv,
    sep="\t",              # ⬅️ LE POINT CRUCIAL
    engine="python",
    encoding="utf-8",
    on_bad_lines="skip"
)

    print("ENGINE USED:", "python")
    print("N_COLS:", len(df.columns))
    print("COLS:", df.columns.tolist())
    print("N_ROWS:", len(df))


    # Nettoyage description
    df["description_sans_html"] = df["description"].apply(clean_text)

    # Extraire les features avec regex
    df["technical_skills"] = df["description_sans_html"].apply(lambda x: find_keywords(x, TECHNICAL_SKILLS))
    df["tools_used"] = df["description_sans_html"].apply(lambda x: find_keywords(x, TOOLS_LIST))
    df["soft_skills"] = df["description_sans_html"].apply(lambda x: find_keywords(x, SOFT_SKILLS))
    df["education_level"] = df["description_sans_html"].apply(lambda x: match_category(x, EDUCATION_LEVELS))

    # Seniorité : si non présent dans scrapper, regex
    df["seniority_level"] = df.apply(
        lambda row: row["seniority_level"] if isinstance(row["seniority_level"], str) and row["seniority_level"] != "" 
        else match_category(row["description_sans_html"], SENIORITY_LEVELS),
        axis=1
    )

    df["benefits"] = df["description_sans_html"].apply(lambda x: find_keywords(x, BENEFITS))
    df["domains"] = df["description_sans_html"].apply(extract_domains)
    df["tasks"] = df["description_sans_html"].apply(extract_tasks)
    df["tone_culture"] = df["description_sans_html"].apply(extract_tone)
    df["eeo_terms"] = df["description_sans_html"].apply(extract_eeo_terms)

    # EEO & visa
    df["eeo_statement"] = df["description_sans_html"].apply(lambda t: "yes" if "equal opportunity" in t else None)
    df["visa_sponsorship"] = df["description_sans_html"].apply(lambda t: "yes" if "visa" in t else None)

    # Work mode
    df["hybrid_policy"] = df["description_sans_html"].apply(detect_work_mode)

    # Experience
    df["experience_mentions"] = df["description_sans_html"].apply(parse_experience)

    # Salaire
    df["salary_min"] = df["description_sans_html"].apply(lambda x: parse_salary(x)[0])
    df["salary_max"] = df["description_sans_html"].apply(lambda x: parse_salary(x)[1])
    df["salary_value"] = df.apply(
        lambda r: (r["salary_min"] + r["salary_max"]) / 2 if pd.notna(r["salary_min"]) else None,
        axis=1
    )
    df["salary_type"] = "annual"
    df["salary_currency"] = "EUR"

    # Sauvegarde finale
    df.to_csv(output_csv, sep=";", index=False)
    print(f"✅ Pipeline terminé. Fichier généré : {output_csv}")
    return df
if __name__ == "__main__":
    enrich_linkedin_dataset(
        input_csv="linkedin-scraper/master_clean1.csv",
        output_csv="data.csv"
    )
