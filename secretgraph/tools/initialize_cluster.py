
import argparse

import requests

parser = argparse.ArgumentParser()
parser.add_argument("url")


def main(argv=None):
    argv = parser.parse_args(argv)
    session = requests.Session()
    result = session.post(
        argv.url
    )


if __name__ == "__main__":
    main()
