#!/usr/bin/env python3
"""
Build a minimal EPUB3 that embeds one image, for manually verifying
arithmetic-JPEG rendering in the reader.

    python make-fixture-epub.py <image.jpg> [out.epub]

Default output: arith-jpeg-sample.epub next to this script.
"""
import sys
import zipfile
from pathlib import Path

CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:acj-fixture-0001</dc:identifier>
    <dc:title>Arithmetic JPEG sample</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="{img}" media-type="image/jpeg"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>
"""

NAV = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>nav</title></head>
  <body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Start</a></li></ol></nav></body>
</html>
"""

CHAPTER = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 1</title></head>
  <body>
    <h1>Arithmetic-coded JPEG below</h1>
    <p>If the compatibility layer works, this image renders. Without it the
       webview shows a broken-image placeholder.</p>
    <p><img src="{img}" alt="arithmetic jpeg" style="max-width:100%"/></p>
  </body>
</html>
"""


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    img_path = Path(sys.argv[1])
    img_name = img_path.name
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).with_name("arith-jpeg-sample.epub")

    with zipfile.ZipFile(out, "w") as z:
        # mimetype first, stored (uncompressed), per the EPUB OCF spec.
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", CONTAINER, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/content.opf", OPF.format(img=img_name), compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/nav.xhtml", NAV, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr("OEBPS/chapter1.xhtml", CHAPTER.format(img=img_name), compress_type=zipfile.ZIP_DEFLATED)
        z.write(img_path, f"OEBPS/{img_name}", compress_type=zipfile.ZIP_DEFLATED)

    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
