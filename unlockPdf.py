import os
import argparse
import pikepdf
parser = argparse.ArgumentParser()
parser.add_argument("filepath")
parser.add_argument("password", default=None)
args = parser.parse_args()
filename, extension = os.path.splitext(args.filepath)
pdf = pikepdf.open(args.filepath, password=args.password)
pdf.save(filename + '_unlocked' + extension)