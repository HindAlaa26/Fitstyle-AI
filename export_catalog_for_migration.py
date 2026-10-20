"""
export_catalog_for_migration.py

Reproduces the catalog loading + cleaning + category mapping steps from
FitStyle_v16 (cells 3, 4, 10, 12, 14) WITHOUT needing torch/open_clip/GPU --
this step is pure metadata, no embeddings involved yet. Run this once, locally
or in Colab CPU, to produce catalog_export.json.

Install: pip install datasets pandas
Run:     python export_catalog_for_migration.py
Output:  catalog_export.json  (ready for migrate_catalog_to_dynamodb.py)
"""

import json
import random
from io import BytesIO
import pandas as pd
from datasets import load_dataset

random.seed(42)

HF_DATASET_NAME = "ashraq/fashion-product-images-small"
HF_SPLIT = "train"

COLUMN_MAP = {
    "id": "id",
    "gender": "gender",
    "articleType": "articleType",
    "baseColour": "baseColour",
    "usage": "usage",
    "season": "season",
    "productDisplayName": "productDisplayName",
}

# Notebook's allow-list of article types -> our 6-value garment_category taxonomy
ALLOWED_TYPES = [
    "Tops", "Tshirts", "Shirts",
    "Jeans", "Trousers", "Skirts", "Shorts",
    "Dresses",
    "Heels", "Flats", "Casual Shoes", "Sandals", "Sports Shoes", "Formal Shoes", "Flip Flops",
    "Jackets", "Sweatshirts", "Sweaters", "Blazers",
    "Handbags", "Belts", "Watches", "Sunglasses", "Jewellery", "Bangle", "Necklace and Chains",
    "Earrings", "Scarves", "Backpacks", "Clutches", "Wallets",
]


def map_garment_category(article_type: str) -> str:
    if article_type in ["Tops", "Tshirts", "Shirts"]:
        return "Top"
    if article_type in ["Jeans", "Trousers", "Skirts", "Shorts"]:
        return "Bottom"
    if article_type == "Dresses":
        return "Dress"
    if article_type in ["Heels", "Flats", "Casual Shoes", "Sandals", "Sports Shoes", "Formal Shoes", "Flip Flops"]:
        return "Shoes"
    if article_type in ["Jackets", "Sweatshirts", "Sweaters", "Blazers"]:
        return "Outerwear"
    if article_type in ["Handbags", "Belts", "Watches", "Sunglasses", "Jewellery", "Bangle",
                         "Necklace and Chains", "Earrings", "Scarves", "Backpacks", "Clutches", "Wallets"]:
        return "Accessory"
    return "Other"


# The recommendation engine's rich 6-value taxonomy -> the frontend's 4-value
# CategoryType (src/types.ts: "top" | "bottom" | "footwear" | "accessories").
# NOTE — approximation, flag for later: the frontend has no dedicated slot for
# dresses or outerwear. Dress is mapped to "top" and Outerwear to "top" as the
# closest visual match (both are worn as the visible upper layer). Revisit this
# if you want a proper "dress" category in the UI later.
GARMENT_TO_FRONTEND_CATEGORY = {
    "Top": "top",
    "Bottom": "bottom",
    "Dress": "top",       # approximation -- see note above
    "Shoes": "footwear",
    "Outerwear": "top",   # approximation -- see note above
    "Accessory": "accessories",
}

POSSIBLE_SIZES = [["S", "M", "L"], ["S", "M", "L", "XL"], ["M", "L"], ["S", "M"], ["M"]]

# No price column exists anywhere in the original notebook -- this range is a
# placeholder so the admin dashboard has something to display and edit.
# Replace with real merchant-provided prices as partners onboard.
PRICE_RANGE = (150, 1200)


def load_catalog() -> pd.DataFrame:
    raw = load_dataset(HF_DATASET_NAME)[HF_SPLIT].to_pandas()
    raw = raw.rename(columns={v: k for k, v in COLUMN_MAP.items()})
    return raw


def main():
    print("Loading dataset from HuggingFace (last time this touches HuggingFace)...")
    df = load_catalog()
    print("Loaded rows:", len(df))
    # Clean (cell 10)
    df = df.drop_duplicates(subset="id", keep="first")
    df = df.dropna(subset=["id", "articleType"])

    # Filter to supported women's categories (cell 12)
    working = df[df["gender"].str.lower() == "women"].copy() if "gender" in df.columns else df.copy()
    catalog = working[working["articleType"].isin(ALLOWED_TYPES)].copy()
    catalog["garment_category"] = catalog["articleType"].apply(map_garment_category)
    catalog = catalog[catalog["garment_category"] != "Other"]
    print("Catalog rows after category filter:", len(catalog))

    # Mock sizes (cell 14) -- same placeholder logic as the notebook.
    # TODO (flagged, not fixed here): these are random, not real merchant sizing.
    catalog["available_sizes"] = [random.choice(POSSIBLE_SIZES) for _ in range(len(catalog))]

    records = []
    for _, row in catalog.iterrows():
        garment_category = row["garment_category"]
        records.append({
            "id": str(row["id"]),
            "name": str(row.get("productDisplayName", "")),
            "garment_category": garment_category,                                  # rich taxonomy, used by the recommendation engine
            "category": GARMENT_TO_FRONTEND_CATEGORY.get(garment_category, "top"),  # 4-value taxonomy, used by the frontend UI
            "colour": str(row.get("baseColour", "")),
            "usage": str(row.get("usage", "")),
            "season": str(row.get("season", "")),
            "available_sizes": list(row["available_sizes"]),
            "price": random.randint(*PRICE_RANGE),
            "image": "",  # left empty on purpose -- image hosting (S3) is a separate step, not done yet
            "inStock": True,
        })

    with open("catalog_export.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(records)} products to catalog_export.json")
    print("Category breakdown:", pd.Series([r['garment_category'] for r in records]).value_counts().to_dict())


if __name__ == "__main__":
    main()
