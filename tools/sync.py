#! /usr/bin/python

import argparse
import re
import subprocess
import sys
from pathlib import Path
from shutil import rmtree

parser = argparse.ArgumentParser()
parser.add_argument("--without-clean", "-n", action="store_true")
parser.add_argument("--without-git", "-g", action="store_true")

gettext_re = re.compile(r"""gettext\(\s*("|')(.+?)\1\s*\)""", re.MULTILINE)
constantsjsextractor = re.compile(r"export +(?:(\w+) +)?([^:]+)")
constantspyextractor = re.compile(r"^(?:(\w+)(?:[^=]*)=|class (\w+))")
pyonly = re.compile("#.* pyonly")
jsonly = re.compile("//.* jsonly")
queryextractor = re.compile(r"(\w+) *= *gql`([^`]+)`", flags=re.MULTILINE)

BASE_DIR = Path(__file__).resolve(strict=True).parent.parent

queries_dest_path = BASE_DIR / "secretgraph" / "queries"
queries_src_path = BASE_DIR / "js-packages" / "graphql-queries" / "src"


def generate_queries(args):
    if not args.without_clean:
        rmtree(queries_dest_path, ignore_errors=True)
    # queries_dest_path.mkdir()
    for file in queries_src_path.glob("**/*.ts"):
        bdir = (queries_dest_path / file.relative_to(queries_src_path)).parent
        bdir.mkdir(exist_ok=True, parents=True)
        newfilecontent = """# WARNING AUTOGENERATED"""
        for match in queryextractor.finditer(file.read_text()):
            newfilecontent = (
                f'{newfilecontent}\n\n{match[1]} = """{match[2]}"""'
            )
        nfile = bdir / f"{file.stem}.py"
        nfile.write_text(newfilecontent)
    if not args.without_git:
        subprocess.run(["git", "add", str(queries_dest_path)])


messages_dest_path = BASE_DIR / "secretgraph" / "proxy" / "js_messages.py"
messages_src_path = BASE_DIR / "js-packages"


def generate_messages(args):
    matches_found = {}
    for file in messages_src_path.glob("**/*.ts?"):
        for match in gettext_re.finditer(file.read_text()):
            matches_found.setdefault(match[2], []).append(
                (file.relative_to(messages_src_path), match.start(0))
            )

    with open(messages_dest_path, "w") as wrob:
        wrob.write(
            "from django.utils.translation import gettext_noop as _\n\n# WARNING AUTOGENERATED\n\n"
        )
        for num, item in enumerate(matches_found.items(), 1):
            match, values = item
            for rel_path, location in values:
                wrob.write(f"# {rel_path}: {location}\n")
            wrob.write(f"_('{match}')\n")
            if num != len(matches_found):
                wrob.write("\n")
    if not args.without_git:
        subprocess.run(["git", "add", str(messages_dest_path)])


constants_py_path = BASE_DIR / "secretgraph" / "core" / "constants.py"
constants_js_path = BASE_DIR / "js-packages" / "misc" / "src" / "constants"


def compare_constants():
    py_constants = set()
    js_constants = set()
    with constants_py_path.open("r") as fileob:
        for lineno, line in enumerate(fileob.readlines(), 1):
            for match in constantspyextractor.finditer(line):
                if not pyonly.search(line):
                    py_constants.add(match[1] or match[2])
    for file in constants_js_path.glob("**/*.ts?"):
        with file.open("r") as fileob:
            for lineno, line in enumerate(fileob.readlines(), 1):
                for match in constantsjsextractor.finditer(line):
                    if not jsonly.search(line):
                        continue
                    if match[1] != "const":
                        print(
                            f"non constant exported: {lineno} ({match[0]})",
                            file=sys.stderr,
                        )
                        continue
                    js_constants.add(match[2])
    for differing in py_constants.difference(js_constants):
        print(
            "in py constants but not in js constants:",
            differing,
            file=sys.stderr,
        )
    for differing in js_constants.difference(py_constants):
        print(
            "in js constants but not in py constants:",
            differing,
            file=sys.stderr,
        )


def main(argv=None):
    args = parser.parse_args(argv)
    generate_queries(args)
    generate_messages(args)
    compare_constants()


if __name__ == "__main__":
    main()
