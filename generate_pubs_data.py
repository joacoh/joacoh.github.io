#!/usr/bin/env python3
"""Parse pubs.bib and generate _data/publications.json for Jekyll."""

import json
import re
import os
import bibtexparser
from bibtexparser.bparser import BibTexParser
from bibtexparser.bwriter import BibTexWriter

OWNER_LAST_NAMES = ["Hernández-Yévenes", "Hernandez-Yevenes"]
OWNER_NAME_NORMALIZED = [re.sub(r"[^a-záéíóúü]", "", n.lower()) for n in OWNER_LAST_NAMES]

LATEX_ACCENT_MAP = {
    "'a": "á", "'e": "é", "'i": "í", "'o": "ó", "'u": "ú",
    "'A": "Á", "'E": "É", "'I": "Í", "'O": "Ó", "'U": "Ú",
    "\"a": "ä", "\"e": "ë", "\"i": "ï", "\"o": "ö", "\"u": "ü",
    "\"A": "Ä", "\"E": "Ë", "\"I": "Ï", "\"O": "Ö", "\"U": "Ü",
}


def clean_latex(text):
    """Remove common LaTeX commands from a string."""
    if not text:
        return ""
    # Handle specific multi-char commands first
    text = re.sub(r"\\+textasciitilde", "~", text)
    text = re.sub(r"\\+raisebox\{[^}]*\}", "", text)
    text = re.sub(r"\\+mnras", "MNRAS", text)
    # Convert dotless i: \i followed by non-letter -> i (before accent map)
    text = re.sub(r"\\+i(?![a-zA-Z])", "i", text)
    # Convert LaTeX accent commands to Unicode
    for latex, unicode_char in LATEX_ACCENT_MAP.items():
        escaped = re.escape(latex)
        text = re.sub(r"\\+" + escaped, unicode_char, text)
    # Strip remaining backslashes
    text = text.replace("\\", "")
    # Remove braces
    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"~", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_authors(author_str):
    """Parse BibTeX author string into a list of (last, first) tuples."""
    if not author_str:
        return []
    authors = []
    for author in author_str.split(' and '):
        author = author.strip()
        if not author:
            continue
        # Handle "Last, First" format
        if ',' in author:
            parts = author.split(',', 1)
            last = parts[0].strip()
            first = parts[1].strip() if len(parts) > 1 else ""
        else:
            parts = author.split()
            last = parts[-1] if parts else ""
            first = ' '.join(parts[:-1]) if len(parts) > 1 else ""
        authors.append((clean_latex(last), clean_latex(first)))
    return authors


def _is_owner(last, first):
    """Check if a given name belongs to the site owner."""
    full = (last + " " + first).lower()
    normalized = re.sub(r"[^a-záéíóúü]", "", full)
    return any(n in normalized for n in OWNER_NAME_NORMALIZED)


def format_authors_html(authors):
    """Format author list as HTML, bolding the site owner."""
    parts = []
    for last, first in authors:
        display = f"{last}, {first}" if first else last
        if _is_owner(last, first):
            parts.append(f"<strong>{display}</strong>")
        else:
            parts.append(display)
    return ", ".join(parts)


def is_first_author(authors):
    """Check if the site owner is the first author. Defaults True if no author info."""
    if not authors:
        return True
    return _is_owner(authors[0][0], authors[0][1])


def build_url(entry):
    """Determine the best URL for the paper."""
    if entry.get('url'):
        return entry['url']
    doi = entry.get('doi', '')
    if doi:
        return f"https://doi.org/{doi}"
    eprint = entry.get('eprint', '')
    if eprint:
        return f"https://arxiv.org/abs/{eprint}"
    adsurl = entry.get('adsurl', '')
    if adsurl:
        return adsurl
    return ""


def main():
    bib_path = os.path.join(os.path.dirname(__file__), '_publications', 'pubs.bib')
    out_path = os.path.join(os.path.dirname(__file__), '_data', 'publications.json')

    parser = BibTexParser(common_strings=True)
    parser.ignore_nonstandard_types = False
    with open(bib_path) as f:
        bib = bibtexparser.load(f, parser=parser)

    first_author_pubs = []
    coauthor_pubs = []

    for entry in bib.entries:
        authors = parse_authors(entry.get('author', ''))
        title = clean_latex(entry.get('title', 'Untitled'))
        venue = clean_latex(entry.get('journal', entry.get('booktitle', '')))
        year = entry.get('year', '')
        doi = entry.get('doi', '')
        abstract = clean_latex(entry.get('abstractNote', ''))
        url = build_url(entry)
        authors_html = format_authors_html(authors)

        pub = {
            'title': title,
            'authors_html': authors_html,
            'venue': venue,
            'year': year,
            'doi': doi,
            'url': url,
            'abstract': abstract,
            'key': entry.get('ID', ''),
        }

        if is_first_author(authors):
            first_author_pubs.append(pub)
        else:
            coauthor_pubs.append(pub)

    # Sort by year descending
    first_author_pubs.sort(key=lambda x: x['year'], reverse=True)
    coauthor_pubs.sort(key=lambda x: x['year'], reverse=True)

    data = {
        'first_author': first_author_pubs,
        'coauthor': coauthor_pubs,
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Generated {out_path}")
    print(f"  First author: {len(first_author_pubs)} papers")
    print(f"  Co-author: {len(coauthor_pubs)} papers")


if __name__ == '__main__':
    main()
