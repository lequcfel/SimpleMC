"""Package corresponding SimpleMC source without build products or private files."""
import argparse
from pathlib import Path
import zipfile
import os

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
excluded = {".git", "node_modules", "target", ".turbo", ".nuxt", "dist", "secrets", "installer-source", ".simplemc-performance"}
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
	for directory, subdirs, files in os.walk(root):
		subdirs[:] = sorted(d for d in subdirs if d not in excluded)
		for filename in sorted(files):
			path = Path(directory) / filename
			if not path.is_file() or path.resolve() == args.output.resolve():
				continue
			rel = path.relative_to(root)
			if any(part in excluded for part in rel.parts):
				continue
			if path.name == ".env" or path.name.startswith(".env.") and not path.name.endswith(".example"):
				continue
			if path.suffix in {".key", ".pfx", ".p12"}:
				continue
			archive.write(path, Path("SimpleMC-source") / rel)
print(args.output)
