#!/usr/bin/env python3
"""Parse _talks/*.md files and generate _data/talks.json for Jekyll."""

import json
import os
import re
import yaml


def parse_talk_file(filepath):
    """Parse a talk .md file, returning front matter dict and body string."""
    with open(filepath) as f:
        content = f.read()

    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            front_matter = yaml.safe_load(parts[1])
            body = parts[2].strip()
            return front_matter, body
    return {}, content.strip()


def extract_description(body):
    """Extract a plain-text description from the body (first paragraph, no HTML)."""
    if not body:
        return ""
    # Strip HTML tags
    text = re.sub(r"<[^>]+>", "", body)
    # Take first paragraph (up to first double newline)
    paragraphs = text.strip().split("\n\n")
    desc = paragraphs[0].strip() if paragraphs else ""
    # Collapse whitespace
    desc = re.sub(r"\s+", " ", desc).strip()
    return desc


def extract_link(body):
    """Extract the first URL from the body if it looks like a resource link."""
    # Look for markdown links [text](url)
    match = re.search(r"\[.*?\]\((https?://[^)]+)\)", body)
    if match:
        return match.group(1)
    return ""


def main():
    talks_dir = os.path.join(os.path.dirname(__file__), "_talks")
    out_path = os.path.join(os.path.dirname(__file__), "_data", "talks.json")

    talks_by_type = {}

    for fname in sorted(os.listdir(talks_dir)):
        if not fname.endswith(".md"):
            continue
        filepath = os.path.join(talks_dir, fname)
        meta, body = parse_talk_file(filepath)

        talk_type = meta.get("type", "Other")
        date = str(meta.get("date", ""))
        # Format date nicely
        if date:
            from datetime import datetime
            try:
                dt = datetime.strptime(date, "%Y-%m-%d")
                date_display = dt.strftime("%B %d, %Y")
            except ValueError:
                date_display = date
        else:
            date_display = ""

        talk = {
            "title": meta.get("title", "Untitled"),
            "type": talk_type,
            "venue": meta.get("venue", ""),
            "location": meta.get("location", ""),
            "date": date_display,
            "raw_date": date,
            "url": meta.get("permalink", ""),
            "link": meta.get("link", "here"),
            "description": extract_description(body),
        }

        if talk_type not in talks_by_type:
            talks_by_type[talk_type] = []
        talks_by_type[talk_type].append(talk)

    # Sort each group by raw date descending
    for talk_type in talks_by_type:
        talks_by_type[talk_type].sort(
            key=lambda t: t.get("raw_date", ""), reverse=True
        )

    # Define preferred order for talk types
    type_order = ["Academic Talk", "Workshop Lead", "Conference Poster", "Outreach Talk"]
    ordered = {}
    for t in type_order:
        if t in talks_by_type:
            ordered[t] = talks_by_type[t]
    for t in talks_by_type:
        if t not in ordered:
            ordered[t] = talks_by_type[t]

    data = {"talks": ordered}

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Generated {out_path}")
    for talk_type, talks in ordered.items():
        print(f"  {talk_type}: {len(talks)} talks")


if __name__ == "__main__":
    main()
