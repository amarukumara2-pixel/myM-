import zipfile
import os

zips = [
    'public/mym-source.zip',
    'dist/mym-source.zip',
    'dist/mym-website.zip',
    'public/mym-website.zip'
]

for zip_path in zips:
    if not os.path.exists(zip_path):
        print(f"{zip_path} does not exist")
        continue
    print(f"Checking {zip_path}...")
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            for name in z.namelist():
                if 'AdminDashboard.tsx' in name:
                    print(f"Found in {zip_path}: {name}")
                    z.extract(name, 'extracted_temp')
                    print(f"Extracted {name} to extracted_temp!")
    except Exception as e:
        print(f"Error checking {zip_path}: {e}")
