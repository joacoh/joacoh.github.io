#!/usr/bin/env python3
"""Fetch citing papers from NASA ADS for _data/publications.json and generate _data/citations.json.

Requires a NASA ADS API key (get one at https://ui.adsabs.harvard.edu/user/settings/token).
Provide the key in either:
  1. A local `.env` file in the repository root (gitignored):
       ADS_API_KEY=your_ads_api_token
  2. An environment variable:
       ADS_API_KEY=your_ads_api_token python3 generate_citations_data.py
"""

import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "joacoh.github.io-pubmap/1.0 (mailto:jheryev@gmail.com)"
ADS_SEARCH_URL = "https://api.adsabs.harvard.edu/v1/search/query"


def load_ads_api_key(base_dir):
    """Load ADS_API_KEY from environment or a local .env file."""
    key = os.environ.get("ADS_API_KEY", "").strip()
    if key:
        return key

    env_path = os.path.join(base_dir, ".env")
    if os.path.isfile(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                if k.strip() == "ADS_API_KEY":
                    return v.strip().strip('"').strip("'")
    return ""


def http_get_json(url, headers=None, retries=3, delay=1.5):
    """GET a URL and parse JSON with polite retries on 429/5xx."""
    req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        req_headers.update(headers)

    for attempt in range(retries):
        req = urllib.request.Request(url, headers=req_headers)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise RuntimeError("NASA ADS rejected the API key (HTTP 401 Unauthorized). Check ADS_API_KEY.") from e
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(delay * (attempt + 1))
                continue
            raise RuntimeError(f"NASA ADS request failed with HTTP {e.code}") from e
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(delay)
                continue
            raise RuntimeError(f"NASA ADS request failed: {e}") from e
    return None


def strip_html(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def make_short_label(title, authors_plain, year):
    """Create a concise 'FirstAuthor+(year)' label for a paper node."""
    authors_plain = (authors_plain or "").strip()
    if authors_plain:
        first_author = authors_plain.split(",")[0].strip()
        # Check if there are multiple authors (comma after first author's given name or "et al.")
        has_multiple = (
            "et al." in authors_plain.lower()
            or authors_plain.count(",") >= 2
            or " and " in authors_plain.lower()
        )
    else:
        first_author = "Paper"
        has_multiple = False
    plus = "+" if has_multiple else ""
    return f"{first_author}{plus}({year})" if year else f"{first_author}{plus}"


def normalize_doi(doi):
    if not doi:
        return ""
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi.strip(), flags=re.I)
    return doi.lower()


def normalize_title(title):
    return re.sub(r"[^a-z0-9]+", "", (title or "").lower())


def fetch_citations_ads(pub, api_key):
    """Fetch citing papers from NASA ADS using bibcode or DOI."""
    bibcode = pub.get("key", "")
    doi = pub.get("doi", "")
    headers = {"Authorization": f"Bearer {api_key}"}

    # Prefer ADS bibcode (19-char standard format, e.g. 2024MNRAS.531.4503H), else DOI
    if bibcode and re.match(r"^\d{4}[A-Za-z0-9.&]{15}$", bibcode):
        q = f"citations(bibcode:{bibcode})"
    elif doi:
        q = f'citations(doi:"{doi}")'
    else:
        return []

    results = []
    start = 0
    rows = 200
    while True:
        params = urllib.parse.urlencode({
            "q": q,
            "fl": "bibcode,title,author,year,pub,doi",
            "rows": rows,
            "start": start,
        })
        data = http_get_json(f"{ADS_SEARCH_URL}?{params}", headers=headers)
        if not data or "response" not in data:
            break

        docs = data["response"].get("docs", [])
        num_found = data["response"].get("numFound", 0)
        for doc in docs:
            title = (doc.get("title") or ["Untitled"])[0]
            authors = doc.get("author") or []
            if len(authors) > 3:
                author_str = ", ".join(authors[:3]) + " et al."
            else:
                author_str = ", ".join(authors)
            doc_doi = (doc.get("doi") or [""])[0]
            doc_bib = doc.get("bibcode", "")
            doc_url = (
                f"https://ui.adsabs.harvard.edu/abs/{doc_bib}"
                if doc_bib
                else (f"https://doi.org/{doc_doi}" if doc_doi else "")
            )
            results.append({
                "bibcode": doc_bib,
                "title": title,
                "authors": author_str,
                "venue": doc.get("pub", ""),
                "year": str(doc.get("year", "")),
                "doi": doc_doi,
                "url": doc_url,
            })

        start += len(docs)
        if start >= num_found or not docs:
            break
        time.sleep(0.3)

    return results


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    pubs_path = os.path.join(base_dir, "_data", "publications.json")
    out_path = os.path.join(base_dir, "_data", "citations.json")

    ads_key = load_ads_api_key(base_dir)
    if not ads_key:
        print(
            "Error: ADS_API_KEY not found.\n"
            "Get a free token at https://ui.adsabs.harvard.edu/user/settings/token\n"
            "Then either:\n"
            "  1. Add it to a local `.env` file in the repo root:\n"
            "       ADS_API_KEY=your_ads_api_token\n"
            "  2. Or pass it as an environment variable:\n"
            "       ADS_API_KEY=your_ads_api_token python3 generate_citations_data.py",
            file=sys.stderr,
        )
        sys.exit(1)

    with open(pubs_path) as f:
        pubs_data = json.load(f)

    nodes = []
    node_by_id = {}
    id_by_bibcode = {}
    id_by_doi = {}
    id_by_title = {}

    def register_node(node, bibcode=""):
        nid = node["id"]
        node_by_id[nid] = node
        nodes.append(node)
        if bibcode:
            id_by_bibcode[bibcode] = nid
        if node.get("doi"):
            id_by_doi[normalize_doi(node["doi"])] = nid
        if node.get("title"):
            id_by_title[normalize_title(node["title"])] = nid
        return nid

    my_pubs = []
    for role in ("first_author", "coauthor"):
        for pub in pubs_data.get(role, []):
            nid = pub.get("key") or normalize_doi(pub.get("doi", "")) or normalize_title(pub.get("title", ""))[:24]
            authors_plain = strip_html(pub.get("authors_html", ""))
            node = {
                "id": nid,
                "title": pub.get("title", "Untitled"),
                "short_label": make_short_label(pub.get("title", ""), authors_plain, pub.get("year", "")),
                "authors": authors_plain,
                "venue": pub.get("venue", ""),
                "year": str(pub.get("year", "")),
                "doi": pub.get("doi", ""),
                "url": pub.get("url", ""),
                "role": role,
                "citation_count": 0,
            }
            register_node(node, bibcode=pub.get("key", ""))
            my_pubs.append((nid, pub))

    links = []
    seen_links = set()
    citing_counter = 0

    for target_id, pub in my_pubs:
        print(f"Querying NASA ADS for: {pub.get('title', target_id)}")
        citations = fetch_citations_ads(pub, ads_key)
        print(f"  -> Found {len(citations)} citing papers")

        for c in citations:
            c_bib = c.get("bibcode", "")
            c_doi_norm = normalize_doi(c.get("doi", ""))
            c_title_norm = normalize_title(c.get("title", ""))

            existing_id = None
            if c_bib and c_bib in id_by_bibcode:
                existing_id = id_by_bibcode[c_bib]
            elif c_doi_norm and c_doi_norm in id_by_doi:
                existing_id = id_by_doi[c_doi_norm]
            elif c_title_norm and c_title_norm in id_by_title:
                existing_id = id_by_title[c_title_norm]

            if existing_id:
                source_id = existing_id
            else:
                citing_counter += 1
                source_id = c_bib or f"cite_{citing_counter}"
                register_node({
                    "id": source_id,
                    "title": c.get("title", "Untitled"),
                    "short_label": make_short_label(c.get("title", ""), c.get("authors", ""), c.get("year", "")),
                    "authors": c.get("authors", ""),
                    "venue": c.get("venue", ""),
                    "year": str(c.get("year", "")),
                    "doi": c.get("doi", ""),
                    "url": c.get("url", ""),
                    "role": "citing",
                    "citation_count": 0,
                }, bibcode=c_bib)

            if source_id == target_id:
                continue

            edge_key = (source_id, target_id)
            if edge_key not in seen_links:
                seen_links.add(edge_key)
                links.append({"source": source_id, "target": target_id})
                node_by_id[target_id]["citation_count"] += 1

        time.sleep(0.3)

    output = {
        "generated_at": datetime.date.today().isoformat(),
        "source": "NASA ADS",
        "nodes": nodes,
        "links": links,
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nGenerated {out_path} via NASA ADS")
    print(f"  Total nodes: {len(nodes)} ({len(my_pubs)} yours, {len(nodes) - len(my_pubs)} citing)")
    print(f"  Total links: {len(links)}")


if __name__ == "__main__":
    main()
