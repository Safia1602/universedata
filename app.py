from flask import Flask, render_template, jsonify
import pandas as pd
import os
import ast
import re

# APP CONFIG
app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

STATS_PATH = os.path.join(DATA_DIR, "job_data_clean.csv")
D3_PATH = os.path.join(DATA_DIR, "jobs_for_d3.csv")

# PARSERS
_SPLIT_RE = re.compile(r"[;,\|]") 

def to_bool(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return False
    if isinstance(v, bool):
        return v
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
    """
    Transforme en liste Python :
    - déjà liste => ok
    - "['a','b']" / "[]" => ast.literal_eval
    - "a;b;c" => split
    - NaN/None/"" => []
    """
    if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]

    s = str(v).strip()
    if not s or s == "[]":
        return []
    if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, (list, tuple)):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass

    # Split classique
    parts = [p.strip().strip("'").strip('"') for p in _SPLIT_RE.split(s)]
    return [p for p in parts if p]


def ensure_id(df: pd.DataFrame) -> pd.DataFrame:
    if "id" not in df.columns:
        df = df.copy()
        df["id"] = range(1, len(df) + 1)
    return df


# DATA LOADING 
def load_stats_df() -> pd.DataFrame:
    if not os.path.exists(STATS_PATH):
        raise FileNotFoundError(f"Stats file not found: {STATS_PATH}")

    df = pd.read_csv(
        STATS_PATH,
     sep=",",                 # séparateur réel
    quotechar='"',           # champs entre guillemets
    escapechar="\\",         # pour \\n, \\\\b, etc.
    engine="python",         # indispensable pour texte long
    encoding="utf-8",
    on_bad_lines="error"
    )
    df = ensure_id(df)

    expected = [
        "id", "title", "company", "country", "location", "link", "source",
        "date_posted", "description", "description_sans_html",
        "technical_skills", "tools_used", "soft_skills",
        "education_level", "seniority_level",
        "benefits", "eeo_statement",
        "hybrid_policy", "visa_sponsorship",
        "tasks", "domains",
        "tone_culture", "eeo_terms",
        "experience_mentions", "salary_value", "salary_type", "salary_currency",
        "experience_years",
    ]
    for col in expected:
        if col not in df.columns:
            df[col] = ""

    # Normalisations types
    df["salary_value"] = df["salary_value"].apply(to_float)
    df["experience_years"] = df["experience_years"].apply(to_float)

    df["hybrid_policy"] = df["hybrid_policy"].apply(to_bool)
    df["visa_sponsorship"] = df["visa_sponsorship"].apply(to_bool)

    # Normalisations listes 
    list_cols = [
        "technical_skills", "tools_used", "soft_skills", "tasks",
        "domains", "benefits", "tone_culture", "eeo_terms"
    ]
    for c in list_cols:
        df[c] = df[c].apply(to_list)

    # cleaning NA
    df = df.fillna("")
    return df


def load_d3_df() -> pd.DataFrame:
    if not os.path.exists(D3_PATH):
        raise FileNotFoundError(f"D3 file not found: {D3_PATH}")

    df = pd.read_csv(
        D3_PATH,
        sep=",",
        encoding="utf-8",
        engine="python",
        on_bad_lines="skip",
    )
    df = ensure_id(df)

    if "topic_keywords" in df.columns and "skills_tech" not in df.columns:
        df["skills_tech"] = df["topic_keywords"]

    for c in ["x_umap", "y_umap", "salary_value", "topic_filtered"]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    if "domains" in df.columns:
        df["domains"] = df["domains"].apply(to_list)

    return df.fillna("")


STATS_DF = load_stats_df()
D3_DF = load_d3_df()
print(f"✅ Stats dataset chargé : {len(STATS_DF)} lignes")
print(f"✅ D3 dataset chargé : {len(D3_DF)} lignes")


# HTML ROUTES

@app.route("/")
def observatoire():
    return render_template("observatoire.html")


@app.route("/explorateur")
def explorateur():
    return render_template("explorateur.html")


@app.route("/tendances")
def tendances():
    return render_template("tendances.html")


@app.route("/startup")
def startup():
    return render_template("startup.html")


@app.route("/explanation")
def explanation():
    return render_template("explanation.html")


@app.route("/index")
def big_picture():
    return render_template("index.html")


@app.route("/methodology")
def methodology():
    return render_template("methodology.html")

# API ROUTES

@app.route("/api/jobs")
def api_jobs():
    return jsonify(STATS_DF.to_dict(orient="records"))


@app.route("/api/job/<int:job_id>")
def api_job(job_id: int):
    row = STATS_DF[STATS_DF["id"] == job_id]
    if row.empty:
        return jsonify({"error": "job not found"}), 404
    return jsonify(row.iloc[0].to_dict())


@app.route("/api/jobs/light")
def api_jobs_light():
    cols = ["id", "title", "company", "country", "location", "seniority_level", "salary_value", "salary_currency", "hybrid_policy", "visa_sponsorship"]
    cols = [c for c in cols if c in STATS_DF.columns]
    return jsonify(STATS_DF[cols].to_dict(orient="records"))


@app.route("/api/d3-data")
def api_d3_data():
    return jsonify(D3_DF.to_dict(orient="records"))


# --- Backward-compat endpoints  ---
@app.route("/api/data")
def api_data_compat():
    return api_jobs()

@app.route("/api/stats-data")
def api_stats_data_compat():
    return api_jobs()

# RUN

if __name__ == "__main__":
    app.run(debug=True)
