import sys, json, base64
import fitz

payload = json.load(sys.stdin)
doc = fitz.open(stream=base64.b64decode(payload['pdf']), filetype='pdf')
assert len(doc) == 7, 'Expected seven printed pages'
page = doc[4]
# Render the actual PDF, then compare each embedded image with the corresponding
# production thumbnail. Inspect its placement too: all three must be on page 5.
render = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
assert render.width > 0 and render.height > 0
candidates = []
for image in page.get_images(full=True):
    xref = image[0]
    pix = fitz.Pixmap(doc, xref)
    if pix.n != 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    candidates.append((xref, pix))
matched = []
for uri in payload['images']:
    source = fitz.Pixmap(base64.b64decode(uri.split(',', 1)[1]))
    if source.n != 3:
        source = fitz.Pixmap(fitz.csRGB, source)
    match = next(((xref, pix) for xref, pix in candidates
                  if xref not in matched and pix.width == source.width
                  and pix.height == source.height and pix.samples == source.samples), None)
    assert match, 'Printed artwork pixels differ from production source'
    xref, pix = match
    rects = page.get_image_rects(xref)
    assert rects and any((rect & page.rect).get_area() > 1000 for rect in rects), 'Artwork is not visibly placed'
    matched.append(xref)
assert len(matched) == 3, 'Expected three distinct artwork images'
print(json.dumps({'pages': len(doc), 'art_page': 5, 'art_count': 3, 'pixel_identical': True, 'render_passed': True}))
