from PIL import Image
from util import listdir
import argparse
import os
import pillow_heif


def transform(filePath):
    filename, extension = os.path.splitext(filePath)
    if not (extension == ".HEIC" or extension == ".heic"):
        return
    heif_file = pillow_heif.read_heif(filePath)
    image = Image.frombytes(
        heif_file.mode,
        heif_file.size,
        heif_file.data,
        "raw",
    )
    image.save(filename + ".jpeg", format("jpeg"))



parser = argparse.ArgumentParser()
parser.add_argument("-p","--path",default="")
args = parser.parse_args()
final_path = os.path.join(os.getcwd(),args.path)
all_files = listdir(final_path, include_files=True)
for file in all_files:
    transform(file)
