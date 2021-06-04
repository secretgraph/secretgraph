#! /usr/bin/env python3
import subprocess
from manage import main

if __name__ == "__main__":
    with subprocess.Popen(["npm", "run", "serve:dev"]):
        main()
