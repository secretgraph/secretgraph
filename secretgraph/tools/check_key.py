import argparse
import base64

from cryptography.hazmat.primitives import serialization

parser = argparse.ArgumentParser()
parser.add_argument("file", type=argparse.FileType("r"))
parser.add_argument("-p", "--password", default=None)


def main(argv=None):
    argv = parser.parse_args(argv)
    try:
        key = base64.b64decode(argv.file.read())
    except Exception:
        parser.exit(message="Not a base64 encoded DER certificate")
    try:
        fkey = serialization.load_der_private_key(key, argv.password)
    except Exception:
        fkey = None
    if fkey:
        parser.exit(0, message=f"A DER private key: {fkey!r}")
    else:
        try:
            fkey = serialization.load_der_public_key(key)
            parser.exit(0, message=f"A DER public key: {fkey!r}")
        except Exception:
            if argv.password:
                parser.exit(message="Password is wrong")
            else:
                parser.exit(message="Not a DER public key")


if __name__ == "__main__":
    main()
