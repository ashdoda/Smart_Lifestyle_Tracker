#!/usr/bin/env python3
"""
Downloads the Fitness Tracker Dataset from Kaggle and saves it as ../fitness_tracker_dataset.csv
(the file the database build and the data scripts expect), so the 72 MB file doesn't have to live in git.

  pip install kagglehub
  python3 scripts/download_fitness_data.py            # from the database/ folder

Safety checks: the download must contain exactly one CSV, with the expected columns, and be byte-for-byte the
version the synthetic check-in data was generated from (size and SHA-256). If Kaggle ever updates the dataset,
the script stops and says so, because the generated data would no longer match it.
Use --allow-different only if you mean to rebuild the synthetic data from a new version.

If Kaggle asks for credentials, create a free Kaggle account and an API token (kaggle.com > Settings), then set
KAGGLE_USERNAME and KAGGLE_KEY, or run `python3 -c "import kagglehub; kagglehub.login()"`.
"""
import argparse
import hashlib
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, '..', 'fitness_tracker_dataset.csv'))
SLUG = 'smayanj/fitness-tracker-dataset'
EXPECTED_HEADER = ('user_id,date,steps,calories_burned,distance_km,active_minutes,sleep_hours,'
                   'heart_rate_avg,workout_type,weather_conditions,location,mood')
EXPECTED_BYTES = 72395254
EXPECTED_SHA256 = '875c8edba57055a9347fd538014c263033573310d4928729d7f886d65c5a0720'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def is_expected(path):
    return os.path.getsize(path) == EXPECTED_BYTES and sha256(path) == EXPECTED_SHA256


def install(src_dir, out, allow_different=False):
    """Find the single CSV inside src_dir, check it, and copy it to out."""
    csvs = sorted(os.path.join(r, f) for r, _, fs in os.walk(src_dir) for f in fs if f.lower().endswith('.csv'))
    if len(csvs) != 1:
        sys.exit(f'Expected exactly one CSV in the download but found {len(csvs)}: {csvs or "none"}')
    src = csvs[0]
    with open(src, encoding='utf-8-sig') as f:
        header = f.readline().strip()
    if header != EXPECTED_HEADER:
        sys.exit(f'Unexpected columns in {os.path.basename(src)}:\n  got      {header}\n  expected {EXPECTED_HEADER}')
    if not is_expected(src):
        msg = ('The download is not the same version the synthetic data was generated from '
               f'(expected {EXPECTED_BYTES:,} bytes, got {os.path.getsize(src):,}). The check-in data in this folder '
               'would no longer line up with it.')
        if not allow_different:
            sys.exit(msg + ' Re-run with --allow-different if you really want it.')
        print('WARNING: ' + msg)
    shutil.copyfile(src, out)
    print(f'Saved {out} ({os.path.getsize(out) / 1e6:.0f} MB)')


def main():
    ap = argparse.ArgumentParser(description='Download the fitness dataset from Kaggle.')
    ap.add_argument('--out', default=DEFAULT_OUT, help='where to save the CSV (default: database/fitness_tracker_dataset.csv)')
    ap.add_argument('--force', action='store_true', help='download again even if the file is already in place')
    ap.add_argument('--allow-different', action='store_true', help='accept a version that differs from the one the data was built from')
    args = ap.parse_args()

    if os.path.exists(args.out) and not args.force and is_expected(args.out):
        print(f'{args.out} is already in place and matches the expected version. Nothing to do.')
        return
    try:
        import kagglehub
    except ImportError:
        sys.exit('kagglehub is not installed. Run:  pip install kagglehub')
    print(f'Downloading {SLUG} from Kaggle ...')
    try:
        folder = kagglehub.dataset_download(SLUG)
    except Exception as e:                      # network problems, missing credentials, dataset moved
        sys.exit(f'Download failed: {e}\nIf Kaggle wants credentials, see the note at the top of this script.')
    install(folder, args.out, args.allow_different)


if __name__ == '__main__':
    main()
