import os
from pdf2image import convert_from_path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("filepath")
parser.add_argument("-p", "--password", default=None)
args = parser.parse_args()
pages = convert_from_path(args.filepath, poppler_path=os.getenv("poppler_path"), userpw=args.password)
filename, _ = os.path.splitext(args.filepath)
if len(pages) == 1:
    pages[0].save(filename + '.jpg', 'JPEG')
else:
    os.makedirs(filename)
    for i in range(len(pages)):
        pages[i].save(os.path.join(filename, 'page ') + str(i) + '.jpg', 'JPEG')
