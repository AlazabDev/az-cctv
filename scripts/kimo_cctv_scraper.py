#!/usr/bin/env python3
"""Kimo Store security systems product and image downloader.
Dependencies: pip install requests beautifulsoup4
"""
import argparse
import csv
import html
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE = 'https://kimostore.net'
COLLECTION = 'security-surveillance'
FIELDS = ['id', 'handle', 'title', 'vendor', 'product_type', 'tags', 'description',
          'url', 'price_egp', 'compare_at_price_egp', 'available', 'sku',
          'variant_count', 'images_count', 'image_urls', 'images_local',
          'variants_json', 'options_json', 'source', 'scraped_at']

def session():
    s = requests.Session()
    retry = Retry(total=4, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=['GET'], respect_retry_after_header=True)
    s.mount('https://', HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8))
    s.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; AZ-CCTV-Catalog/1.0; product-catalog-research)',
                      'Accept-Language': 'en-US,en;q=0.9'})
    return s

def get(s, url, delay):
    time.sleep(delay)
    r = s.get(url, timeout=(12, 45))
    r.raise_for_status()
    return r

def normalize_image(url):
    if not url: return ''
    if url.startswith('//'): return 'https:' + url
    return urljoin(BASE, url)

def cleanup_description(txt):
    return BeautifulSoup(html.unescape(txt or ''), 'html.parser').get_text(' ', strip=True)

def api_items(s, delay):
    """Use public Shopify collection feed if available, otherwise signal HTML fallback."""
    first = f'{BASE}/collections/{COLLECTION}/products.json?limit=250&page=1'
    try:
        r = get(s, first, delay)
        obj = r.json()
        if not isinstance(obj.get('products'), list): raise ValueError('No products list')
    except (requests.RequestException, ValueError) as e:
        print(f'[INFO] JSON collection feed unavailable ({type(e).__name__}); trying HTML pages', flush=True)
        return None
    items = {}
    page = 1
    while True:
        if page == 1: batch = obj['products']
        else:
            try: batch = get(s, f'{BASE}/collections/{COLLECTION}/products.json?limit=250&page={page}', delay).json()['products']
            except (requests.RequestException, ValueError, KeyError) as e:
                print(f'[WARN] Collection API page {page} failed: {e}', flush=True)
                break
        print(f'[CATALOG API] page={page} returned={len(batch)} unique={len(items)}', flush=True)
        if not batch: break
        new = 0
        for p in batch:
            if not p.get('handle'): continue
            key = str(p.get('id') or p['handle'])
            if key not in items: new += 1
            items[key] = p
        if len(batch) < 250 or new == 0: break
        page += 1
        if page > 100: raise RuntimeError('Page limit reached')
    return list(items.values())

def html_handles(s, delay):
    handles = set()
    # Shopify-themed storefronts commonly expose these product cards.
    for page in range(1, 101):
        url = f'{BASE}/collections/{COLLECTION}?page={page}&limit=48'
        r = get(s, url, delay)
        soup = BeautifulSoup(r.text, 'html.parser')
        current = set()
        for a in soup.select('a[href*="/products/"]'):
            m = re.search(r'/products/([^/?#]+)', a.get('href', ''))
            if m: current.add(m.group(1))
        newer = current - handles
        handles.update(newer)
        print(f'[CATALOG HTML] page={page} links={len(current)} new={len(newer)} total={len(handles)}', flush=True)
        if not current or not newer: break
    return sorted(handles)

def get_product(s, handle, delay):
    # Public JSON endpoint (usually present on Shopify stores).
    for path in (f'/products/{handle}.js', f'/products/{handle}.json'):
        try:
            r = get(s, BASE + path, delay)
            obj = r.json()
            p = obj.get('product', obj)
            if p.get('handle') or p.get('title'):
                p['_source'] = path
                return p
        except (requests.RequestException, ValueError, AttributeError): pass
    # JSON-LD fallback on rendered product page.
    r = get(s, BASE + '/products/' + handle, delay)
    soup = BeautifulSoup(r.text, 'html.parser')
    for tag in soup.select('script[type="application/ld+json"]'):
        try: data = json.loads(tag.string or tag.get_text())
        except (ValueError, TypeError): continue
        candidates = data if isinstance(data, list) else data.get('@graph', [data]) if isinstance(data, dict) else []
        for x in candidates:
            if not isinstance(x, dict) or 'Product' not in str(x.get('@type', '')): continue
            offers = x.get('offers') or {}
            if isinstance(offers, list): offers = offers[0] if offers else {}
            images = x.get('image') or []
            if isinstance(images, str): images = [images]
            return {'handle': handle, 'title': x.get('name', ''), 'body_html': x.get('description', ''),
                    'vendor': (x.get('brand') or {}).get('name', '') if isinstance(x.get('brand'), dict) else x.get('brand', ''),
                    'images': [{'src': u} for u in images], 'variants': [{'sku': x.get('sku', ''),
                    'price': offers.get('price', ''), 'available': offers.get('availability', '').endswith('InStock')}],
                    '_source': 'json-ld', '_price_decimal': True}
    raise ValueError('Product detail cannot be parsed')

def image_urls(p):
    out = []
    for im in p.get('images') or []:
        url = im if isinstance(im, str) else im.get('src') or im.get('url') if isinstance(im, dict) else ''
        url = normalize_image(url)
        if url and url not in out: out.append(url)
    if not out and isinstance(p.get('featured_image'), str): out = [normalize_image(p['featured_image'])]
    return out

def money(value, decimal=False):
    if value is None or value == '': return ''
    try:
        x = float(value)
        return round(x if decimal else x / 100, 2)
    except (TypeError, ValueError): return ''

def record(p):
    variants = p.get('variants') or []
    first = variants[0] if variants else {}
    decimal = p.get('_price_decimal', False) or p.get('_source', 'collection-api') == 'collection-api' or p.get('_source', '').endswith('.json')
    urls = image_urls(p)
    return {'id': p.get('id', ''), 'handle': p.get('handle', ''), 'title': p.get('title', ''),
            'vendor': p.get('vendor', ''), 'product_type': p.get('product_type', ''),
            'tags': ', '.join(p.get('tags', [])) if isinstance(p.get('tags'), list) else p.get('tags', ''),
            'description': cleanup_description(p.get('body_html') or p.get('description')),
            'url': BASE + '/products/' + str(p.get('handle', '')),
            'price_egp': money(first.get('price', p.get('price')), decimal),
            'compare_at_price_egp': money(first.get('compare_at_price'), decimal),
            'available': first.get('available', ''), 'sku': first.get('sku', ''),
            'variant_count': len(variants), 'images_count': len(urls), 'image_urls': urls,
            'images_local': [], 'variants_json': variants, 'options_json': p.get('options', []),
            'source': p.get('_source', 'collection-api'),
            'scraped_at': datetime.now(timezone.utc).isoformat()}

def safe_name(text):
    name = re.sub(r'[^A-Za-z0-9_.-]+', '_', str(text)).strip('._')
    return name[:90] or 'product'

def fetch_image(s, url, dest, delay):
    if dest.exists() and dest.stat().st_size > 100: return True
    time.sleep(delay)
    tmp = dest.with_suffix(dest.suffix + '.part')
    try:
        with s.get(url, timeout=(12, 60), stream=True) as r:
            r.raise_for_status()
            ctype = r.headers.get('Content-Type', '')
            if 'image/' not in ctype: raise ValueError(f'Not an image: {ctype}')
            with tmp.open('wb') as f:
                for block in r.iter_content(128 * 1024):
                    if block: f.write(block)
        if tmp.stat().st_size < 100: raise ValueError('Image too small')
        tmp.replace(dest)
        return True
    except (requests.RequestException, OSError, ValueError) as e:
        print(f'    [IMAGE ERROR] {url}: {e}', flush=True)
        tmp.unlink(missing_ok=True)
        return False

def save(rows, folder):
    path = folder / 'products.json'
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    with (folder / 'products.csv').open('w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for row in rows:
            copy = dict(row)
            for key in ('image_urls', 'images_local', 'variants_json', 'options_json'):
                copy[key] = json.dumps(copy[key], ensure_ascii=False)
            w.writerow(copy)

def main():
    ap = argparse.ArgumentParser(description='Download Kimo Store CCTV products, metadata and images')
    ap.add_argument('--out', default='kimo_cctv', help='Output directory')
    ap.add_argument('--delay', type=float, default=0.8, help='Seconds between requests')
    ap.add_argument('--limit', type=int, default=0, help='Max products, 0=all')
    ap.add_argument('--no-images', action='store_true', help='Only collect data')
    args = ap.parse_args()
    if args.delay < 0: ap.error('--delay must be >= 0')
    folder = Path(args.out).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    s = session()
    products = api_items(s, args.delay)
    if products is None:
        handles = html_handles(s, args.delay)
        if not handles: raise RuntimeError('No product links found. Site layout may have changed.')
        entries = [('handle', h) for h in handles]
    else:
        if not products: raise RuntimeError('Collection endpoint returned 0 products')
        entries = [('product', p) for p in products]
    if args.limit: entries = entries[:args.limit]
    state = folder / 'products.json'
    prior = json.loads(state.read_text(encoding='utf-8')) if state.exists() else []
    by_handle = {x['handle']: x for x in prior if x.get('handle')}
    errors = []
    for i, (kind, value) in enumerate(entries, 1):
        handle = value if kind == 'handle' else value.get('handle', '')
        if not handle: continue
        print(f'[{i}/{len(entries)}] {handle}', flush=True)
        try:
            # Always refresh product details; retain local image paths for resume.
            p = get_product(s, handle, args.delay) if kind == 'handle' else value
            rec = record(p)
            if rec['images_count'] == 0 and kind == 'product':
                # Some collection feeds omit image details.
                rec = record(get_product(s, handle, args.delay))
            old = by_handle.get(handle, {})
            rec['images_local'] = [x for x in old.get('images_local', []) if (folder / x).exists()]
            if not args.no_images:
                image_dir = folder / 'images' / safe_name(handle)
                image_dir.mkdir(parents=True, exist_ok=True)
                for n, url in enumerate(rec['image_urls'], 1):
                    ext = Path(urlparse(url).path).suffix.lower()
                    if ext not in ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'): ext = '.jpg'
                    dest = image_dir / f'{n:03d}{ext}'
                    rel = dest.relative_to(folder).as_posix()
                    if fetch_image(s, url, dest, args.delay) and rel not in rec['images_local']:
                        rec['images_local'].append(rel)
            by_handle[handle] = rec
            print(f'    OK | {rec["title"][:65]} | EGP {rec["price_egp"]} | images {len(rec["images_local"])}/{rec["images_count"]}', flush=True)
        except (requests.RequestException, ValueError, OSError, KeyError) as e:
            errors.append({'handle': handle, 'error': str(e)})
            print(f'    [ERROR] {e}', flush=True)
        finally:
            save(list(by_handle.values()), folder)
            (folder / 'errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\nDONE | products={len(by_handle)} errors={len(errors)} | output={folder}', flush=True)
    print('Files: products.csv, products.json, errors.json, images/', flush=True)
    if errors: sys.exit(2)

if __name__ == '__main__':
    main()
