
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("url")


def main(argv=None):
    argv = parser.parse_args(argv)


if __name__ == "__main__":
    main()
