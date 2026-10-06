#!/usr/bin/env bash
# 担当ペアの画像パスを表示する。
#   bash .claude/skills/digimon-crew/pick-image.sh taichi-agumon
# images/custom/ に同じ名前の画像があればそちらを優先し、なければオリジナルのドット絵
# （動く GIF、なければ止まった PNG）を使う。
dir="$(cd "$(dirname "$0")" && pwd)/images"
id="${1:-taichi-agumon}"
for ext in png jpg jpeg gif webp; do
  if [ -f "$dir/custom/$id.$ext" ]; then echo "$dir/custom/$id.$ext"; exit 0; fi
done
for ext in gif png; do
  if [ -f "$dir/$id.$ext" ]; then echo "$dir/$id.$ext"; exit 0; fi
done
echo "画像が見つかりません: $id" >&2
exit 1
