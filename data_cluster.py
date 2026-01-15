

import re
import numpy as np
import pandas as pd

from bertopic import BERTopic
from umap import UMAP
from sentence_transformers import SentenceTransformer
import hdbscan

from google.colab import files


# -----------------------
# 1) Upload your input CSV in Colab
# -----------------------
uploaded = files.upload()
print("Uploaded:", list(uploaded.keys()))

# -----------------------
# 2) Configuration
# -----------------------
INPUT_FILE = "data.csv"
INPUT_SEP  = "|"

# Output files (as you specified)
TOPICS_OUT = "topics_bertopic.csv"
JOBS_OUT   = "jobs_for_d3.csv"

# Embedding model used to compute text embeddings
EMBEDDING_MODEL_NAME = "intfloat/e5-large"

# Text columns to concatenate
CANDIDATE_TEXT_COLS = [
    "title",
    "description_sans_html",
    "technical_skills",
    "tools_used",
    "soft_skills",
    "domains",
]

# BERTopic / clustering parameters
RANDOM_STATE = 42
MIN_CLUSTER_SIZE = 50

# Internal UMAP (helps clustering quality)
UMAP_INTERNAL_N_NEIGHBORS = 30
UMAP_INTERNAL_MIN_DIST = 0.0
UMAP_INTERNAL_N_COMPONENTS = 5
UMAP_INTERNAL_METRIC = "cosine"

# 2D UMAP for visualization export (x_umap/y_umap)
UMAP_2D_N_NEIGHBORS = 30
UMAP_2D_MIN_DIST = 0.1
UMAP_2D_METRIC = "cosine"


# -----------------------
# 3) Load dataset
# -----------------------
df = pd.read_csv(INPUT_FILE, sep=INPUT_SEP)
print("Dataset loaded:", df.shape)
display(df.head(2))


# -----------------------
# 4) Build the text field
# -----------------------
def clean_text(x: str) -> str:
    """Basic cleanup: collapse whitespace and strip."""
    if pd.isna(x):
        return ""
    x = str(x)
    x = re.sub(r"\s+", " ", x).strip()
    return x

# Keep only columns that exist in the file
text_cols = [c for c in CANDIDATE_TEXT_COLS if c in df.columns]
if not text_cols:
    raise ValueError(
        "No text columns found in the dataset.\n"
        "Edit CANDIDATE_TEXT_COLS to match your CSV columns."
    )

df["text_for_topic"] = (
    df[text_cols]
    .fillna("")
    .astype(str)
    .agg(" | ".join, axis=1)
    .map(clean_text)
)

docs = df["text_for_topic"].tolist()
print("Text columns used:", text_cols)
print("Example text snippet:", df["text_for_topic"].iloc[0][:200])


# -----------------------
# 5) Compute embeddings (SentenceTransformers)
# -----------------------
print("Loading embedding model:", EMBEDDING_MODEL_NAME)
embedder = SentenceTransformer(EMBEDDING_MODEL_NAME)

print("Computing embeddings...")
embeddings = embedder.encode(
    docs,
    show_progress_bar=True,
    convert_to_numpy=True
).astype(np.float32)

print("Embeddings shape:", embeddings.shape)


# -----------------------
# 6) Train BERTopic
# -----------------------
# Internal UMAP used by BERTopic before clustering
umap_model_internal = UMAP(
    n_neighbors=UMAP_INTERNAL_N_NEIGHBORS,
    n_components=UMAP_INTERNAL_N_COMPONENTS,
    min_dist=UMAP_INTERNAL_MIN_DIST,
    metric=UMAP_INTERNAL_METRIC,
    random_state=RANDOM_STATE,
)

# HDBSCAN clustering
hdbscan_model = hdbscan.HDBSCAN(
    min_cluster_size=MIN_CLUSTER_SIZE,
    metric="euclidean",
    cluster_selection_method="eom",
    prediction_data=True,
)

topic_model = BERTopic(
    umap_model=umap_model_internal,
    hdbscan_model=hdbscan_model,
    language="english",
    calculate_probabilities=False,
    verbose=True,
)

print("Fitting BERTopic...")
topics, _ = topic_model.fit_transform(docs, embeddings)
df["topic_filtered"] = topics


# -----------------------
# 7) Create topic metadata columns
# -----------------------
# topic_size: size of each topic repeated for each document row
topic_counts = df["topic_filtered"].value_counts().to_dict()
df["topic_size"] = df["topic_filtered"].map(topic_counts).fillna(0).astype(int)

# topic_keywords: comma-separated top words for each topic
TOP_N_KEYWORDS = 10

def get_keywords(topic_id: int, top_n: int = TOP_N_KEYWORDS) -> str:
    """Return top-N keywords for a topic as a comma-separated string."""
    topic_id = int(topic_id)
    if topic_id == -1:
        return ""
    words_scores = topic_model.get_topic(topic_id)
    if not words_scores:
        return ""
    return ", ".join([w for w, _ in words_scores[:top_n]])

df["topic_keywords"] = df["topic_filtered"].apply(get_keywords)

# topic_name: formatted like "{topicId}_{kw1}_{kw2}_{kw3}..."
TOP_N_NAME_WORDS = 5

def make_topic_name(topic_id: int, top_n: int = TOP_N_NAME_WORDS) -> str:
    """Create a readable topic name based on top words."""
    topic_id = int(topic_id)

    if topic_id == -1:

        kw_series = df.loc[df["topic_filtered"] == -1, "topic_keywords"]
        if kw_series.notna().any():
            sample = kw_series.iloc[0]
            if isinstance(sample, str) and sample.strip():
                parts = [p.strip() for p in sample.split(",") if p.strip()][:top_n]
                if parts:
                    return "-1_" + "_".join(parts)
        return "-1_outliers"

    words_scores = topic_model.get_topic(topic_id) or []
    words = [w for w, _ in words_scores[:top_n]]
    if not words:
        return f"{topic_id}_unknown"
    return f"{topic_id}_" + "_".join(words)

df["topic_name"] = df["topic_filtered"].apply(make_topic_name)


# -----------------------
# 8) Compute UMAP 2D coordinates for visualization export
# -----------------------
umap_2d = UMAP(
    n_neighbors=UMAP_2D_N_NEIGHBORS,
    n_components=2,
    min_dist=UMAP_2D_MIN_DIST,
    metric=UMAP_2D_METRIC,
    random_state=RANDOM_STATE,
)

coords_2d = umap_2d.fit_transform(embeddings)
df["x_umap"] = coords_2d[:, 0]
df["y_umap"] = coords_2d[:, 1]


# -----------------------
# 9) Build topics_bertopic.csv
# -----------------------
topic_info = topic_model.get_topic_info().copy()
topic_info.rename(columns={"Topic": "topic_id", "Count": "topic_size"}, inplace=True)

# Build a keywords column for each topic_id
def topic_keywords_for_table(topic_id: int, top_n: int = TOP_N_KEYWORDS) -> str:
    if int(topic_id) == -1:
        return ""
    words_scores = topic_model.get_topic(int(topic_id))
    if not words_scores:
        return ""
    return ", ".join([w for w, _ in words_scores[:top_n]])

topic_info["topic_keywords"] = topic_info["topic_id"].apply(topic_keywords_for_table)
topic_info["topic_name"] = topic_info["topic_id"].apply(make_topic_name)

# Keep a clean set of columns
topics_df = topic_info[["topic_id", "topic_name", "topic_keywords", "topic_size"]].copy()

# Save topics file
topics_df.to_csv(TOPICS_OUT, index=False)
print("Saved topics file:", TOPICS_OUT, topics_df.shape)
display(topics_df.head(10))


# -----------------------
# 10) Build jobs_for_d3.csv
# -----------------------
jobs_df = df.copy()

# Save jobs file
jobs_df.to_csv(JOBS_OUT, index=False)
print("Saved jobs file:", JOBS_OUT, jobs_df.shape)
display(jobs_df.head(2))


# -----------------------
# 11) Download both files
# -----------------------
files.download(TOPICS_OUT)
files.download(JOBS_OUT)