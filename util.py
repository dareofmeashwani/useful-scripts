import os


def listdir(target="./", include_files=False, include_folder=False):
    items = [os.path.join(target, f) for f in os.listdir(target) if
             include_files and os.path.isfile(os.path.join(target, f)) or include_folder and os.path.isdir(
                 os.path.join(target, f))]
    return items
