from PIL import Image
from util import listdir
import argparse
import os
import time

def transform(filePath, target):
    filename = os.path.basename(filePath)
    image = Image.open(filePath)
    width, height = image.size
    new_width = min(width, height)
    new_height = min(width, height)
    left = (width - new_width) / 2
    top = (height - new_height) / 2
    right = (width + new_width) / 2
    bottom = (height + new_height) / 2
    image = image.crop((left, top, right, bottom))
    new_image = image.resize((400, 400))
    new_image.save( os.path.join(target,filename))
    #image.save(filename + ".jpeg", format("jpeg"))


parser = argparse.ArgumentParser()
parser.add_argument("-p","--path",default="")
args = parser.parse_args()
final_path = os.path.join(os.getcwd(),args.path)
all_files = None
if os.path.isfile(final_path):
    all_files = [final_path]
else:
    all_files = listdir(final_path, include_files=True)
thumbnails_path = os.path.join(os.path.dirname(all_files[0]), "thumbnails")
if not os.path.exists(thumbnails_path):
    os.makedirs(thumbnails_path)
for file in all_files:
    transform(file, thumbnails_path)
