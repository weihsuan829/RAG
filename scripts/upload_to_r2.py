"""將 data/markdown/ 的議案檔案上傳到 R2 bucket（bills/ 目錄下）。

用法： cd backend && uv run python ../scripts/upload_to_r2.py
"""

import sys
from pathlib import Path

import boto3

from yarag.config import settings

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "markdown"
PREFIX = "bills/"

s3 = boto3.client(
    "s3",
    endpoint_url=settings.endpoint_url,
    aws_access_key_id=settings.aws_access_key_id,
    aws_secret_access_key=settings.aws_secret_access_key,
    region_name=settings.region_name,
)

files = sorted(SRC.glob("*.md"))
if not files:
    sys.exit(f"找不到檔案：{SRC}")

for i, f in enumerate(files, 1):
    s3.upload_file(
        str(f),
        settings.default_bucket,
        f"{PREFIX}{f.name}",
        ExtraArgs={"ContentType": "text/markdown"},
    )
    if i % 50 == 0 or i == len(files):
        print(f"已上傳 {i}/{len(files)}")

paginator = s3.get_paginator("list_objects_v2")
total = sum(page.get("KeyCount", 0) for page in paginator.paginate(Bucket=settings.default_bucket, Prefix=PREFIX))
print(f"驗證：bucket「{settings.default_bucket}」的 {PREFIX} 下共有 {total} 個物件")
