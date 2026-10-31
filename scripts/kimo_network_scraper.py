#!/usr/bin/env python3
"""Extract Kimo Store NETWORK collection products and images (public pages only).

Install: python -m pip install requests beautifulsoup4
Run: python kimo_network_scraper.py --out 'F:\\Tools\\CCTV\\KimoStore\\Network' --delay 1
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
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE = 'https://kimostore.net'
COLLECTION = 'network'
FIELDS = [
    'id', 'handle', 'title', 'vendor', 'product_type', 'network_category',
    'tags', 'description', 'url', 'price_egp', 'compare_at_price_egp',
    'available', 'sku', 'variant_count', 'images_count', 'image_urls',
    'images_local', 'variants_json', 'options_json', 'source', 'scraped_at'
]
CATEGORY_RULES = [
    ('Network Rack', r'\brack\b|\bpdu\b|rackmount|patch panel|cable management|rack shelf'),
    ('Network Switch', r'\bswitch\b|\bpoe switch\b'),
    ('Access Point', r'access point|\bwireless ap\b'),
    ('Router', r'\brouter\b|\bmodem\b|\bar[Cc]her\b'),
    ('Range Extender', r'range extender|repeater|powerline|power line'),
    ('Fiber Optic', r'\bfiber\b|\bfibre\b|\bsfp\b|optical'),
    ('Network Cable', r'cat\s*[5678]\b|ethernet cable|lan cable|patch cord|utp|ftp cable'),
    ('Network Connector', r'\brj45\b|keystone|faceplate|patch panel|punch down|network tester|crimp'),
    ('Intercom / Doorbell', r'intercom|doorbell|door bell'),
    ('Time Attendance', r'fingerprint|time attendance|face recognition'),
    ('IP Phone', r'\bip phone\b|\bvoip\b'),
    ('Network Adapter', r'lan card|network adapter|wifi adapter|wireless usb|usb adapter'),
]

def category(title, product_type='', tags=''):
    text = ' '.join([str(title), str(product_type), str(tags)])
    for label, pattern in CATEGORY_RULES:
        if re.search(pattern, text, re.I):
            return label
    return 'Other Network Products'

def make_session():
    s = requests.Session()
    retry = Retry(total=4, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=['GET'], respect_retry_after_header=True)
    s.mount('https://', HTTPAdapter(max_retries=retry, pool_connections=6, pool_maxsize=6))
    s.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; AZ-CCTV-NetworkCatalog/1.0)',
                      'Accept-Language': 'en-US,en;q=0.9'})
    return s

def request(s, url, delay):
    time.sleep(delay)
    r = s.get(url, timeout=(12, 45))
    r.raise_for_status()
    return r

def image_url(raw):
    if not raw:
        return ''
    if raw.startswith('//'):
        return 'https:' + raw
    return urljoin(BASE, raw)

def product_feed(s, delay):
    """Shopify public collection feed; None means use HTML fallback."""
    url = f'{BASE}/collections/{COLLECTION}/products.json?limit=250&page=1'
    try:
        obj = request(s, url, delay).json()
        if not isinstance(obj, dict) or not isinstance(obj.get('products'), list):
            raise ValueError('Unexpected public JSON response')
    except (requests.RequestException, ValueError) as exc:
        print(f'[FEED] unavailable: {exc}. Trying product links from HTML.', flush=True)
        return None
    products = {}
    for page in range(1, 101):
        if page == 1:
            batch = obj['products']
        else:
            try:
                batch = request(s, f'{BASE}/collections/{COLLECTION}/products.json?limit=250&page={page}', delay).json()['products']
            except (requests.RequestException, ValueError, KeyError) as exc:
                raise RuntimeError(f'Catalog page {page} incomplete: {exc}') from exc
        added = 0
        for p in batch:
            key = p.get('handle')
            if key and key not in products:
                p['_source'] = 'collection-api'
                products[key] = p
                added += 1
        print(f'[CATALOG] page={page} items={len(batch)} new={added} total={len(products)}', flush=True)
        if not batch or len(batch) < 250 or added == 0:
            break
    return list(products.values())

def html_handles(s, delay):
    handles = set()
    for page in range(1, 101):
        url = f'{BASE}/collections/{COLLECTION}?page={page}'
        soup = BeautifulSoup(request(s, url, delay).text, 'html.parser')
        found = set()
        for a in soup.select('a[href*="/products/"]'):
            match = re.search(r'/products/([^/?#]+)', a.get('href', ''))
            if match:
                found.add(match.group(1))
        new = found - handles
        handles.update(new)
        print(f'[HTML] page={page} links={len(found)} new={len(new)} total={len(handles)}', flush=True)
        if not found or not new:
            break
    return sorted(handles)

def product_details(s, handle, delay):
    for suffix in ('.js', '.json'):
        try:
            response = request(s, f'{BASE}/products/{handle}{suffix}', delay).json()
            p = response.get('product', response)
            if isinstance(p, dict) and p.get('title'):
                p['_source'] = f'product{suffix}'
                return p
        except (requests.RequestException, ValueError, AttributeError):
            pass
    soup = BeautifulSoup(request(s, f'{BASE}/products/{handle}', delay).text, 'html.parser')
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or script.get_text())
        except (TypeError, ValueError):
            continue
        candidates = data if isinstance(data, list) else data.get('@graph', [data]) if isinstance(data, dict) else []
        for x in candidates:
            if not isinstance(x, dict) or 'Product' not in str(x.get('@type', '')):
                continue
            offers = x.get('offers') or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            imgs = x.get('image') or []
            if isinstance(imgs, str):
                imgs = [imgs]
            brand = x.get('brand') or ''
            return {'handle': handle, 'title': x.get('name', ''), 'body_html': x.get('description', ''),
                    'vendor': brand.get('name', '') if isinstance(brand, dict) else brand,
                    'images': imgs, 'variants': [{'sku': x.get('sku', ''), 'price': offers.get('price'),
                    'available': str(offers.get('availability', '')).endswith('InStock')}],
                    '_source': 'json-ld'}
    raise ValueError('Unable to parse product detail')

def collect_images(p):
    result = []
    candidates = p.get('images') or []
    for obj in candidates:
        raw = obj if isinstance(obj, str) else obj.get('src') or obj.get('url') if isinstance(obj, dict) else ''
        url = image_url(raw)
        if url and url not in result:
            result.append(url)
    if not result:
        feature = p.get('featured_image')
        raw = feature if isinstance(feature, str) else feature.get('src') if isinstance(feature, dict) else ''
        if raw:
            result.append(image_url(raw))
    return result

def parse_money(val, source):
    if val is None or val == '':
        return ''
    try:
        # Shopify product.js uses integer minor units; products.json and JSON-LD use decimal EGP.
        return round(float(val) / (100 if source == 'product.js' else 1), 2)
    except (ValueError, TypeError):
        return ''

def row_from_product(p):
    variants = p.get('variants') or []
    first = variants[0] if variants else {}
    source = p.get('_source', 'collection-api')
    image_urls = collect_images(p)
    tags = p.get('tags', [])
    if isinstance(tags, list):
        tags = ', '.join(str(x) for x in tags)
    return {
        'id': p.get('id', ''), 'handle': p.get('handle', ''), 'title': p.get('title', ''),
        'vendor': p.get('vendor', ''), 'product_type': p.get('product_type', ''),
        'network_category': category(p.get('title', ''), p.get('product_type', ''), tags),
        'tags': tags,
        'description': BeautifulSoup(html.unescape(p.get('body_html') or p.get('description') or ''), 'html.parser').get_text(' ', strip=True),
        'url': f"{BASE}/products/{p.get('handle', '')}",
        'price_egp': parse_money(first.get('price', p.get('price')), source),
        'compare_at_price_egp': parse_money(first.get('compare_at_price'), source),
        'available': first.get('available', p.get('available', '')),
        'sku': first.get('sku', ''), 'variant_count': len(variants),
        'images_count': len(image_urls), 'image_urls': image_urls, 'images_local': [],
        'variants_json': variants, 'options_json': p.get('options', []), 'source': source,
        'scraped_at': datetime.now(timezone.utc).isoformat()
    }

def download_image(s, url, dst, delay):
    if dst.exists() and dst.stat().st_size >= 100:
        return True
    tmp = Path(str(dst) + '.part')
    try:
        time.sleep(delay)
        with s.get(url, timeout=(12, 60), stream=True) as response:
            response.raise_for_status()
            if not response.headers.get('content-type', '').lower().startswith('image/'):
                raise ValueError('Response is not an image')
            with tmp.open('wb') as f:
                for block in response.iter_content(128 * 1024):
                    if block:
                        f.write(block)
        if tmp.stat().st_size < 100:
            raise ValueError('Image is too small')
        tmp.replace(dst)
        return True
    except (OSError, requests.RequestException, ValueError) as exc:
        print(f'    [IMAGE ERROR] {url}: {exc}', flush=True)
        tmp.unlink(missing_ok=True)
        return False

def write_outputs(records, errors, folder):
    records = sorted(records, key=lambda r: str(r.get('handle', '')))
    (folder / 'products.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    with (folder / 'products.csv').open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
        writer.writeheader()
        for rec in records:
            flat = dict(rec)
            for k in ('image_urls', 'images_local', 'variants_json', 'options_json'):
                flat[k] = json.dumps(flat.get(k, []), ensure_ascii=False)
            writer.writerow(flat)
    (folder / 'errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding='utf-8')
    summary = {'collection': f'{BASE}/collections/{COLLECTION}', 'products_saved': len(records),
               'downloaded_images': sum(len(r.get('images_local', [])) for r in records),
               'errors': len(errors), 'categories': {}}
    for rec in records:
        key = rec.get('network_category', 'Other')
        summary['categories'][key] = summary['categories'].get(key, 0) + 1
    (folder / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

def main():
    parser = argparse.ArgumentParser(description='Kimo Store NETWORK collection products + images')
    parser.add_argument('--out', default='kimo_network', help='Output directory')
    parser.add_argument('--delay', type=float, default=1.0, help='Delay in seconds between requests')
    parser.add_argument('--limit', type=int, default=0, help='Limit products for testing (0 = all)')
    parser.add_argument('--no-images', action='store_true', help='Metadata only')
    args = parser.parse_args()
    if args.delay < 0 or args.limit < 0:
        parser.error('--delay and --limit must be non-negative')
    folder = Path(args.out).expanduser().resolve()
    folder.mkdir(parents=True, exist_ok=True)
    state = folder / 'products.json'
    try:
        previous = json.loads(state.read_text(encoding='utf-8')) if state.exists() else []
        if not isinstance(previous, list):
            raise ValueError('products.json must be a list')
    except (ValueError, OSError) as exc:
        print(f'[FATAL] Existing products.json cannot be read: {exc}', file=sys.stderr)
        return 1
    saved = {str(r['handle']): r for r in previous if isinstance(r, dict) and r.get('handle')}
    session = make_session()
    try:
        feed = product_feed(session, args.delay)
        entries = [('product', p) for p in feed] if feed is not None else [('handle', h) for h in html_handles(session, args.delay)]
    except (requests.RequestException, RuntimeError) as exc:
        print(f'[FATAL] Catalog discovery failed: {exc}', file=sys.stderr)
        return 1
    if not entries:
        print('[FATAL] No network products found; nothing overwritten.', file=sys.stderr)
        return 1
    if args.limit:
        entries = entries[:args.limit]
    errors = []
    for i, (kind, val) in enumerate(entries, 1):
        handle = val if kind == 'handle' else val.get('handle', '')
        if not handle:
            continue
        print(f'[{i}/{len(entries)}] {handle}', flush=True)
        try:
            p = product_details(session, handle, args.delay) if kind == 'handle' else val
            row = row_from_product(p)
            if not row['images_count'] and kind == 'product':
                row = row_from_product(product_details(session, handle, args.delay))
            imgdir = folder / 'images' / re.sub(r'[^a-zA-Z0-9_.-]+', '_', handle)[:100]
            old = saved.get(handle, {})
            row['images_local'] = [rel for rel in old.get('images_local', []) if (folder / rel).is_file()]
            if not args.no_images:
                imgdir.mkdir(parents=True, exist_ok=True)
                for n, url in enumerate(row['image_urls'], 1):
                    extension = Path(urlparse(url).path).suffix.lower()
                    if extension not in ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'):
                        extension = '.jpg'
                    dest = imgdir / f'{n:03d}{extension}'
                    relative = dest.relative_to(folder).as_posix()
                    if download_image(session, url, dest, args.delay) and relative not in row['images_local']:
                        row['images_local'].append(relative)
            saved[handle] = row
            print(f'    OK | {row["network_category"]} | {row["title"][:62]} | EGP {row["price_egp"]} | Images {len(row["images_local"])}/{row["images_count"]}', flush=True)
        except (ValueError, KeyError, OSError, requests.RequestException) as exc:
            errors.append({'handle': handle, 'error': str(exc)})
            print(f'    [ERROR] {exc}', flush=True)
        finally:
            write_outputs(list(saved.values()), errors, folder)
    print(f'\nDONE | products={len(saved)} errors={len(errors)} | {folder}', flush=True)
    return 2 if errors else 0

if __name__ == '__main__':
    sys.exit(main())
