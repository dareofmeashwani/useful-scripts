from PIL import Image
from util import listdir
import argparse
import os

parser = argparse.ArgumentParser()
parser.add_argument("-p", "--path", default="")
args = parser.parse_args()
final_path = os.path.join(os.getcwd(), args.path)
all_files = None
if os.path.isfile(final_path):
    all_files = [final_path]
else:
    all_files = listdir(final_path, include_files=True)
images = []
supportedFileTypes = [ ".jpeg",".jpg",".png",".gif",".svg",".bmp",".tiff"]
for f in all_files:
    filename, extension = os.path.splitext(f)
    if extension.lower() not in supportedFileTypes:
        continue
    img = Image.open(f)
    #background = Image.new("RGB", img.size, (255, 255, 255))
    #background.paste(img, mask=img.split()[3])
    images.append(img)
images[0].save(
    os.path.join(final_path, "ouput.pdf"), "PDF", resolution=100.0, save_all=True, append_images=images[1:]
)
