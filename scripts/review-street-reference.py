from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

photos = sorted(Path(r'C:\Users\Inseok\Desktop\새 폴더').glob('*.jpg'))
frames = sorted(Path('design/reference-video-frames').glob('*.jpg'))
files = photos + frames
width, height, columns = 360, 270, 4
rows = (len(files) + columns - 1) // columns
sheet = Image.new('RGB', (width * columns, height * rows), '#f5f3ee')
draw = ImageDraw.Draw(sheet)
for index, path in enumerate(files):
    image = Image.open(path).convert('RGB')
    thumb = ImageOps.contain(image, (width - 8, height - 36))
    x, y = index % columns * width, index // columns * height
    sheet.paste(thumb, (x + (width - thumb.width) // 2, y))
    label = path.name if path in photos else f'video {path.stem}'
    draw.text((x + 7, y + height - 30), label, fill='#222222')
sheet.save('design/reference-contact-sheet.jpg', quality=90)
print(f'{len(photos)} photos, {len(frames)} frames')
